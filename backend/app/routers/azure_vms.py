import asyncio
import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.maintenance import SyncHistory, SyncProgress
from app.models.settings import ZoneAzureConfig
from app.models.virtual_machine import VirtualMachine
from app.models.zone import Zone
from app.services.azure_service import (
    fetch_vm_details_in_batches,
    fetch_vms_from_subscription,
    get_azure_arm_token,
    get_graph_access_token,
    list_subscriptions,
)
from app.services.credentials_service import get_secret

logger = logging.getLogger(__name__)

router = APIRouter()


class SyncRequest(BaseModel):
    zone_id: str | None = None
    zone_code: str | None = None


class SyncCronRequest(BaseModel):
    pass


# ─── List VMs ────────────────────────────────────────────────────────────────

@router.get("/vms")
async def list_vms(
    zone_id: str | None = Query(None),
    search: str | None = Query(None),
    os_type: str | None = Query(None),
    power_state: str | None = Query(None),
    domain_status: str | None = Query(None),
    onboarding_status: str | None = Query(None),
    limit: int = Query(500, le=2000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    query = select(VirtualMachine)

    if zone_id:
        query = query.where(VirtualMachine.zone_id == zone_id)
    if os_type:
        query = query.where(VirtualMachine.os_type == os_type)
    if power_state:
        query = query.where(VirtualMachine.power_state == power_state)
    if domain_status:
        query = query.where(VirtualMachine.domain_status == domain_status)
    if onboarding_status:
        query = query.where(VirtualMachine.onboarding_status == onboarding_status)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            VirtualMachine.name.ilike(pattern)
            | VirtualMachine.ip_address.ilike(pattern)
            | VirtualMachine.resource_group.ilike(pattern)
        )

    # Get total count
    count_q = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    # Paginate
    query = query.order_by(VirtualMachine.name).limit(limit).offset(offset)
    result = await db.execute(query)
    rows = result.scalars().all()

    return {
        "data": [_vm_to_dict(vm) for vm in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# ─── Sync Azure VMs (manual, single zone) ───────────────────────────────────

@router.post("/sync")
async def sync_azure_vms(body: SyncRequest, db: AsyncSession = Depends(get_db)):
    start_time = time.time()
    progress_id = None

    try:
        zone_id = body.zone_id
        zone_code = body.zone_code

        logger.info(f"Sync requested for zone: {zone_code or 'global'} (ID: {zone_id or 'none'})")

        # Create progress record
        progress = SyncProgress(
            sync_type="azure_vms",
            status="running",
            current_step="authenticating",
            processed_count=0,
            total_count=0,
        )
        db.add(progress)
        await db.commit()
        await db.refresh(progress)
        progress_id = str(progress.id)
        logger.info(f"Created progress record: {progress_id}")

        # Get credentials with zone suffix
        suffix = f"_{zone_code}" if zone_code else ""
        tenant_id = await get_secret(db, f"azure_tenant_id{suffix}")
        client_id = await get_secret(db, f"azure_client_id{suffix}")
        client_secret = await get_secret(db, f"azure_client_secret{suffix}")

        if not tenant_id or not client_id or not client_secret:
            await _update_progress(db, progress_id, status="failed",
                                   error_message=f"Azure credentials not configured for zone {zone_code or 'global'}")
            return {"success": False, "error": f"Azure credentials not configured for zone {zone_code or 'global'}"}

        # Get configured subscription IDs from zone config
        configured_sub_ids: list[str] = []
        if zone_id:
            zac_result = await db.execute(
                select(ZoneAzureConfig.subscription_ids).where(ZoneAzureConfig.zone_id == zone_id)
            )
            sub_ids_json = zac_result.scalar_one_or_none()
            if sub_ids_json and isinstance(sub_ids_json, list):
                configured_sub_ids = [
                    (s if isinstance(s, str) else s.get("id", ""))
                    for s in sub_ids_json
                    if s
                ]
                logger.info(f"Using {len(configured_sub_ids)} subscriptions from zone config")

        # Authenticate with Azure ARM
        arm_token = await get_azure_arm_token(tenant_id, client_id, client_secret)
        logger.info(f"Azure ARM auth completed in {int((time.time() - start_time) * 1000)}ms")

        # Get Graph API token for domain detection
        graph_token = ""
        try:
            graph_token = await get_graph_access_token(tenant_id, client_id, client_secret)
            logger.info("Graph API token obtained successfully")
        except Exception as e:
            logger.warning(f"Failed to get Graph token, will use Run Command fallback: {e}")

        await _update_progress(db, progress_id, current_step="fetching_subscriptions")

        # List subscriptions and filter
        all_subs = await list_subscriptions(arm_token)
        if configured_sub_ids:
            filtered_subs = [s for s in all_subs if s["subscriptionId"] in configured_sub_ids]
        else:
            filtered_subs = all_subs

        logger.info(f"Syncing VMs from {len(filtered_subs)} subscriptions")
        await _update_progress(db, progress_id, current_step="fetching_vms")

        # Fetch VMs from all subscriptions in parallel
        vm_lists = await asyncio.gather(
            *[
                fetch_vms_from_subscription(
                    s["subscriptionId"],
                    s.get("displayName", s["subscriptionId"]),
                    arm_token,
                )
                for s in filtered_subs
            ]
        )
        all_vm_entries = [vm for sublist in vm_lists for vm in sublist]
        logger.info(f"Found {len(all_vm_entries)} VMs across all subscriptions")

        if not all_vm_entries:
            await _update_progress(db, progress_id, status="completed", current_step="completed",
                                   total_count=0, processed_count=0)
            duration_ms = int((time.time() - start_time) * 1000)
            return {"success": True, "synced": 0, "failed": 0, "total": 0,
                    "message": "No VMs found in the specified subscriptions", "duration_ms": duration_ms}

        await _update_progress(db, progress_id, current_step="processing_details",
                               total_count=len(all_vm_entries))

        # Fetch VM details in parallel batches
        async def progress_callback(count: int):
            await _update_progress(db, progress_id, processed_count=count)

        logger.info("Fetching VM details (NIC, power state, domain) in parallel batches...")
        all_vms = await fetch_vm_details_in_batches(
            all_vm_entries, arm_token, graph_token, zone_id, batch_size=10,
            progress_callback=progress_callback,
        )

        await _update_progress(db, progress_id, current_step="saving")

        # Batch upsert all VMs
        logger.info("Upserting all VMs to database in batch...")
        for vm_data in all_vms:
            stmt = pg_insert(VirtualMachine).values(**vm_data)
            stmt = stmt.on_conflict_do_update(
                index_elements=["azure_vm_id"],
                set_={
                    "name": stmt.excluded.name,
                    "ip_address": stmt.excluded.ip_address,
                    "subscription": stmt.excluded.subscription,
                    "subscription_name": stmt.excluded.subscription_name,
                    "resource_group": stmt.excluded.resource_group,
                    "os_type": stmt.excluded.os_type,
                    "power_state": stmt.excluded.power_state,
                    "domain_status": stmt.excluded.domain_status,
                    "domain_name": stmt.excluded.domain_name,
                    "location": stmt.excluded.location,
                    "vm_size": stmt.excluded.vm_size,
                    "last_synced_at": stmt.excluded.last_synced_at,
                    "zone_id": stmt.excluded.zone_id,
                    "updated_at": datetime.now(timezone.utc),
                },
            )
            await db.execute(stmt)
        await db.commit()

        duration_ms = int((time.time() - start_time) * 1000)

        await _update_progress(db, progress_id, status="completed", current_step="completed",
                               processed_count=len(all_vms))

        logger.info(f"Sync completed in {duration_ms}ms - {len(all_vms)} VMs processed")

        return {
            "success": True,
            "synced": len(all_vms),
            "failed": 0,
            "total": len(all_vms),
            "duration_ms": duration_ms,
            "progress_id": progress_id,
        }

    except Exception as e:
        logger.error(f"Error in sync-azure-vms: {e}")
        if progress_id:
            try:
                await _update_progress(db, progress_id, status="failed", error_message=str(e))
            except Exception:
                pass
        duration_ms = int((time.time() - start_time) * 1000)
        return {"success": False, "error": str(e), "duration_ms": duration_ms}


# ─── Sync Azure VMs Cron (all configured zones) ─────────────────────────────

@router.post("/sync-cron")
async def sync_azure_vms_cron(db: AsyncSession = Depends(get_db)):
    start_time = time.time()
    logger.info("[sync-azure-vms-cron] Starting scheduled sync...")

    try:
        # Fetch configured zones with their zone info
        result = await db.execute(
            select(ZoneAzureConfig.zone_id, Zone.code, Zone.name)
            .join(Zone, ZoneAzureConfig.zone_id == Zone.id)
            .where(ZoneAzureConfig.is_configured.is_(True))
        )
        configured_zones = result.all()

        if not configured_zones:
            logger.info("[sync-azure-vms-cron] No configured zones found")
            db.add(SyncHistory(
                trigger_type="scheduled",
                zones_processed=0,
                results=[],
                status="completed",
                duration_ms=int((time.time() - start_time) * 1000),
            ))
            await db.commit()
            return {"message": "No configured zones to sync", "zones_processed": 0}

        logger.info(f"[sync-azure-vms-cron] Found {len(configured_zones)} configured zone(s)")

        results = []

        for zone_id, zone_code, zone_name in configured_zones:
            zone_start = time.time()
            logger.info(f"[sync-azure-vms-cron] Syncing zone: {zone_code} ({zone_name})")

            try:
                sync_result = await sync_azure_vms(
                    SyncRequest(zone_id=str(zone_id), zone_code=zone_code),
                    db=db,
                )

                if sync_result.get("success"):
                    results.append({
                        "zone_code": zone_code,
                        "zone_name": zone_name,
                        "status": "success",
                        "synced_count": sync_result.get("synced", 0),
                        "duration_ms": int((time.time() - zone_start) * 1000),
                    })
                else:
                    results.append({
                        "zone_code": zone_code,
                        "zone_name": zone_name,
                        "status": "error",
                        "error_message": sync_result.get("error", "Unknown error"),
                        "duration_ms": int((time.time() - zone_start) * 1000),
                    })
            except Exception as e:
                logger.error(f"[sync-azure-vms-cron] Exception syncing zone {zone_code}: {e}")
                results.append({
                    "zone_code": zone_code,
                    "zone_name": zone_name,
                    "status": "error",
                    "error_message": str(e),
                    "duration_ms": int((time.time() - zone_start) * 1000),
                })

            # Small delay between zones to avoid rate limiting
            await asyncio.sleep(1)

        total_duration = int((time.time() - start_time) * 1000)
        success_count = sum(1 for r in results if r["status"] == "success")
        error_count = sum(1 for r in results if r["status"] == "error")

        logger.info(
            f"[sync-azure-vms-cron] Completed. Success: {success_count}, "
            f"Errors: {error_count}, Duration: {total_duration}ms"
        )

        # Record in sync_history
        if error_count > 0:
            history_status = "partial" if success_count > 0 else "failed"
        else:
            history_status = "completed"

        db.add(SyncHistory(
            trigger_type="scheduled",
            zones_processed=len(configured_zones),
            results=results,
            status=history_status,
            duration_ms=total_duration,
        ))
        await db.commit()

        return {
            "message": "Scheduled sync completed",
            "zones_processed": len(configured_zones),
            "success_count": success_count,
            "error_count": error_count,
            "duration_ms": total_duration,
            "results": results,
        }

    except Exception as e:
        logger.error(f"[sync-azure-vms-cron] Fatal error: {e}")
        return {"error": str(e), "message": "Scheduled sync failed"}


# ─── Sync Progress Polling ───────────────────────────────────────────────────

@router.get("/sync-progress/{progress_id}")
async def get_sync_progress(progress_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SyncProgress).where(SyncProgress.id == progress_id))
    progress = result.scalar_one_or_none()
    if not progress:
        return {"error": "Progress record not found"}
    return {
        "id": str(progress.id),
        "sync_type": progress.sync_type,
        "status": progress.status,
        "current_step": progress.current_step,
        "processed_count": progress.processed_count,
        "total_count": progress.total_count,
        "error_message": progress.error_message,
        "started_at": progress.started_at.isoformat() if progress.started_at else None,
        "completed_at": progress.completed_at.isoformat() if progress.completed_at else None,
    }


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _update_progress(db: AsyncSession, progress_id: str, **kwargs):
    """Update sync_progress record."""
    kwargs["updated_at"] = datetime.now(timezone.utc)
    if kwargs.get("status") in ("completed", "failed"):
        kwargs["completed_at"] = datetime.now(timezone.utc)
    await db.execute(
        update(SyncProgress).where(SyncProgress.id == progress_id).values(**kwargs)
    )
    await db.commit()


def _vm_to_dict(vm: VirtualMachine) -> dict:
    return {
        "id": str(vm.id),
        "name": vm.name,
        "ip_address": vm.ip_address,
        "subscription": vm.subscription,
        "subscription_name": vm.subscription_name,
        "resource_group": vm.resource_group,
        "os_type": vm.os_type,
        "power_state": vm.power_state,
        "domain_status": vm.domain_status,
        "domain_name": vm.domain_name,
        "azure_vm_id": vm.azure_vm_id,
        "location": vm.location,
        "vm_size": vm.vm_size,
        "onboarding_status": vm.onboarding_status,
        "onboarding_type": vm.onboarding_type,
        "onboarding_error": vm.onboarding_error,
        "zone_id": str(vm.zone_id) if vm.zone_id else None,
        "last_synced_at": vm.last_synced_at.isoformat() if vm.last_synced_at else None,
        "created_at": vm.created_at.isoformat() if vm.created_at else None,
        "updated_at": vm.updated_at.isoformat() if vm.updated_at else None,
    }
