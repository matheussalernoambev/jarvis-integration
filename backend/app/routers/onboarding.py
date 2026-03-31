import asyncio
import logging
import time
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.beyondtrust_cache import BtWorkgroup
from app.models.maintenance import SyncHistory, SyncProgress
from app.models.onboarding import OnboardingLog, OnboardingRule, OnboardingSetting
from app.models.settings import ZoneAzureConfig, ZoneSchedule
from app.models.virtual_machine import VirtualMachine
from app.models.zone import Zone
from app.services.beyondtrust_service import build_base_url, build_ps_auth_header
from app.services.credentials_service import get_secret
from app.services.onboarding_service import (
    add_accounts_to_quick_rule,
    bt_login,
    bt_signout,
    create_asset,
    create_managed_account,
    create_managed_system,
    create_quick_rule,
    generate_description,
    get_functional_accounts,
    get_managed_accounts_of_system,
    get_managed_system_by_id,
    get_platform_id_from_os_type,
    get_quick_rule_accounts,
    resolve_platform_and_policy,
    search_asset,
    search_managed_system,
    search_quick_rule,
    update_asset,
    update_managed_system,
    update_quick_rule_accounts,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class OnboardRequest(BaseModel):
    vm_id: str


class OnboardCronRequest(BaseModel):
    pass


# ─── Start Onboarding (single VM) ───────────────────────────────────────────

@router.post("/start")
async def start_onboarding(body: OnboardRequest, db: AsyncSession = Depends(get_db)):
    vm_id = body.vm_id
    progress_id = None

    try:
        logger.info(f"Starting onboarding for VM: {vm_id}")

        # Get VM
        result = await db.execute(select(VirtualMachine).where(VirtualMachine.id == vm_id))
        vm = result.scalar_one_or_none()
        if not vm:
            return {"success": False, "error": "VM not found"}

        # Get onboarding settings (zone-specific, then global fallback)
        settings = None
        if vm.zone_id:
            r = await db.execute(select(OnboardingSetting).where(OnboardingSetting.zone_id == vm.zone_id))
            settings = r.scalar_one_or_none()
        if not settings:
            r = await db.execute(select(OnboardingSetting).where(OnboardingSetting.zone_id.is_(None)).limit(1))
            settings = r.scalar_one_or_none()
        if not settings:
            return {"success": False, "error": f"Onboarding settings not configured for zone: {vm.zone_id}"}

        logger.info(f"Using settings for zone: {vm.zone_id or 'global'}, workgroup: {settings.workgroup}")

        # Get BT credentials
        bt_url = await get_secret(db, "beyondtrust_url")
        bt_ps_auth = await get_secret(db, "beyondtrust_ps_auth")
        bt_username = await get_secret(db, "beyondtrust_username")
        bt_password = await get_secret(db, "beyondtrust_password")

        if not bt_url or not bt_ps_auth or not bt_username or not bt_password:
            return {"success": False, "error": "BeyondTrust credentials not configured"}

        base_url = build_base_url(bt_url)
        ps_auth = build_ps_auth_header(bt_ps_auth, bt_username, bt_password)

        # Update VM status to in_progress
        await db.execute(
            update(VirtualMachine).where(VirtualMachine.id == vm_id).values(
                onboarding_status="in_progress", onboarding_error=None
            )
        )
        db.add(OnboardingLog(vm_id=vm.id, status="started", message="Onboarding process initiated"))
        await db.commit()

        # Create progress tracking
        progress = SyncProgress(
            sync_type="onboarding", status="running", vm_id=vm.id,
            current_step="authenticating", processed_count=0, total_count=5,
        )
        db.add(progress)
        await db.commit()
        await db.refresh(progress)
        progress_id = str(progress.id)

        async def update_progress(step: str, processed: int):
            await db.execute(
                update(SyncProgress).where(SyncProgress.id == progress_id).values(
                    current_step=step, processed_count=processed,
                    updated_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()

        # Login to BT
        session_cookie = await bt_login(base_url, ps_auth)
        await update_progress("searching_asset", 1)

        try:
            # ═══ RULES MATCHING ═══
            vm_platform_id = get_platform_id_from_os_type(vm.os_type)
            vm_domain_status = vm.domain_status or "standalone"
            logger.info(f"Platform ID: {vm_platform_id} for os_type: {vm.os_type}, domain: {vm_domain_status}")

            rules_result = await db.execute(
                select(OnboardingRule)
                .where(
                    OnboardingRule.zone_id == vm.zone_id,
                    OnboardingRule.managed_system_platform_id == vm_platform_id,
                    OnboardingRule.domain_type.in_(["any", vm_domain_status]),
                )
                .order_by(OnboardingRule.domain_type.desc())
            )
            applicable_rules = rules_result.scalars().all()
            logger.info(f"Found {len(applicable_rules)} onboarding rules")

            workgroup_id: str | None = None
            platform_id: int
            policy_id: int
            functional_account_id: int | None = None
            account_names_list: list[str]
            quick_rule_id: str | None = None
            quick_rule_name: str | None = None
            rule_used: str | None = None

            if applicable_rules:
                rule = applicable_rules[0]
                platform_id = rule.managed_system_platform_id
                policy_id = rule.password_policy_id or 1
                functional_account_id = int(rule.functional_account_id) if rule.functional_account_id else None
                account_names_list = rule.account_names or []
                quick_rule_id = rule.quick_rule_id
                quick_rule_name = rule.quick_rule_name
                rule_used = rule.name

                if rule.workgroup_id:
                    workgroup_id = str(rule.workgroup_id)
                    logger.info(f'Using workgroup from rule "{rule.name}": {workgroup_id}')

                logger.info(f"Using rule: {rule.name}, platform={platform_id}, policy={policy_id}")
            else:
                logger.warning("No onboarding rule found, using legacy settings")
                resolved = resolve_platform_and_policy(vm.os_type)
                platform_id = resolved["platform"]
                policy_id = resolved["policy"]
                account_names_list = [n.strip() for n in (settings.account_names or "").split(",") if n.strip()]

                if settings.functional_account and settings.functional_account.isdigit():
                    functional_account_id = int(settings.functional_account)
                elif settings.functional_account:
                    accounts = await get_functional_accounts(base_url, ps_auth, session_cookie)
                    func_acc = next(
                        (a for a in accounts if (a.get("DisplayName") or "").lower() == settings.functional_account.lower()),
                        None,
                    )
                    functional_account_id = func_acc.get("FunctionalAccountID") if func_acc else None

                if not functional_account_id:
                    raise Exception("No functional account configured")

            # Workgroup fallback from settings
            if not workgroup_id and settings.workgroup and settings.workgroup != "0":
                if settings.workgroup.isdigit():
                    workgroup_id = settings.workgroup
                else:
                    wg_r = await db.execute(
                        select(BtWorkgroup.workgroup_id, BtWorkgroup.name)
                        .where(BtWorkgroup.name.ilike(f"%{settings.workgroup}%"))
                        .limit(1)
                    )
                    cached_wg = wg_r.first()
                    if cached_wg:
                        workgroup_id = str(cached_wg.workgroup_id)

            if not workgroup_id:
                raise Exception("No workgroup configured")

            # Fetch zone data for templates
            zone_code, zone_name = "", ""
            if vm.zone_id:
                zr = await db.execute(select(Zone.code, Zone.name).where(Zone.id == vm.zone_id))
                zone_row = zr.first()
                if zone_row:
                    zone_code, zone_name = zone_row.code or "", zone_row.name or ""

            system_description = generate_description(settings.system_description_template, {
                "vm_name": vm.name, "resource_group": vm.resource_group,
                "os_type": vm.os_type, "domain_status": vm.domain_status,
                "ip_address": vm.ip_address or "", "zone_code": zone_code,
                "zone_name": zone_name, "subscription": vm.subscription or "",
                "subscription_name": vm.subscription_name or "",
                "location": vm.location or "", "vm_size": vm.vm_size or "",
            })

            asset_created = False
            managed_system_created = False
            accounts_created = 0
            accounts_existed = 0

            # Step 1: Asset
            logger.info(f"Searching for asset: {vm.name}")
            asset_list = await search_asset(base_url, ps_auth, session_cookie, vm.name)
            if not asset_list:
                logger.info("Creating new asset...")
                asset_data = {
                    "IPAddress": vm.ip_address or "",
                    "AssetName": vm.name,
                    "OperatingSystem": vm.os_type,
                    "AssetType": "Computer",
                    "DomainName": (vm.domain_name or "") if vm.domain_status == "domain_joined" else "",
                    "DnsName": vm.name,
                }
                created = await create_asset(base_url, ps_auth, session_cookie, workgroup_id, asset_data)
                asset_id = created["AssetID"]
                asset_created = True
            else:
                asset_id = asset_list[0]["AssetID"]
                existing = asset_list[0]
                if (existing.get("IPAddress", "") != (vm.ip_address or "")
                        or existing.get("DnsName", "") != vm.name
                        or existing.get("OperatingSystem", "") != vm.os_type):
                    await update_asset(base_url, ps_auth, session_cookie, asset_id, {
                        "IPAddress": vm.ip_address or "", "AssetName": vm.name,
                        "OperatingSystem": vm.os_type, "AssetType": "Computer", "DnsName": vm.name,
                    })

            await update_progress("creating_system", 2)

            # Step 2: Managed System
            logger.info(f"Searching for managed system: {vm.name}")
            ms_list = await search_managed_system(base_url, ps_auth, session_cookie, vm.name)
            if not ms_list:
                logger.info("Creating managed system...")
                ms_data = {
                    "HostName": vm.name,
                    "PlatformID": platform_id,
                    "Description": system_description,
                    "PasswordRuleID": policy_id,
                    "AutoManagementFlag": settings.automanage_system,
                    "FunctionalAccountID": functional_account_id,
                }
                created_ms = await create_managed_system(base_url, ps_auth, session_cookie, asset_id, ms_data)
                managed_system_id = created_ms["ManagedSystemID"]
                managed_system_created = True
            else:
                managed_system_id = ms_list[0]["ManagedSystemID"]
                existing_ms = await get_managed_system_by_id(base_url, ps_auth, session_cookie, managed_system_id)
                if (existing_ms.get("Description") != system_description
                        or existing_ms.get("AutoManagementFlag") != settings.automanage_system
                        or existing_ms.get("FunctionalAccountID") != functional_account_id):
                    updated = {**existing_ms, "Description": system_description,
                               "AutoManagementFlag": settings.automanage_system,
                               "FunctionalAccountID": functional_account_id}
                    for k in ("ManagedSystemID", "ID", "ObjectID", "DateCreated", "LastChangeDate"):
                        updated.pop(k, None)
                    await update_managed_system(base_url, ps_auth, session_cookie, managed_system_id, updated)

            await update_progress("creating_accounts", 3)

            # Step 3: Managed Accounts
            created_account_ids: list[str] = []
            is_ad = (settings.account_type_rule == "ad"
                     or (settings.account_type_rule == "auto" and vm.domain_status == "domain_joined"))
            domain = (vm.domain_name or "") if is_ad else ""

            for account_name in account_names_list:
                acct_desc = generate_description(settings.account_description_template, {
                    "account_name": account_name, "vm_name": vm.name,
                    "resource_group": vm.resource_group,
                    "zone_code": zone_code, "zone_name": zone_name,
                })

                existing_accts = await get_managed_accounts_of_system(
                    base_url, ps_auth, session_cookie, managed_system_id, account_name
                )

                if not existing_accts:
                    acct_data: dict = {
                        "AccountName": account_name,
                        "Description": acct_desc,
                        "DomainName": domain,
                        "AutoManagementFlag": settings.automanage_accounts and settings.automanage_system,
                        "PasswordRuleID": policy_id,
                        "LoginAccountFlag": True,
                        "password": settings.default_password or "TempP@ss123!",
                        "ApiEnabled": True,
                    }

                    if is_ad and domain:
                        acct_data["SAMAccountName"] = account_name[:20]
                        acct_data["UserPrincipalName"] = f"{account_name}@{domain}"

                    if settings.automanage_accounts and settings.automanage_system:
                        acct_data["ChangeFrequencyType"] = settings.change_frequency_type
                        acct_data["ChangeFrequencyDays"] = settings.change_frequency_days
                        acct_data["ChangeTime"] = settings.change_time
                        acct_data["MaxConcurrentRequests"] = settings.max_concurrent_requests
                        acct_data["ChangePasswordAfterAnyReleaseFlag"] = True
                        acct_data["CheckPasswordFlag"] = True
                        acct_data["ResetPasswordOnMismatchFlag"] = True
                        next_change = datetime.now(timezone.utc) + timedelta(days=settings.change_frequency_days)
                        acct_data["NextChangeDate"] = next_change.strftime("%Y-%m-%d")

                    created_acct = await create_managed_account(
                        base_url, ps_auth, session_cookie, managed_system_id, acct_data
                    )
                    created_account_ids.append(created_acct["ManagedAccountID"])
                    accounts_created += 1
                else:
                    created_account_ids.append(existing_accts[0]["ManagedAccountID"])
                    accounts_existed += 1

            await update_progress("updating_quickrule", 4)

            # Step 4: Quick Rule from rule
            quick_rule_updated = False
            if quick_rule_id and created_account_ids:
                try:
                    await add_accounts_to_quick_rule(
                        base_url, ps_auth, session_cookie, quick_rule_id, created_account_ids
                    )
                    quick_rule_updated = True
                except Exception as e:
                    logger.warning(f"Quick Rule update failed: {e}")

            # Step 4b: Legacy Quick Rule from settings
            if not quick_rule_id and settings.quickrule and created_account_ids:
                legacy_rules = await search_quick_rule(base_url, ps_auth, session_cookie, settings.quickrule)
                if legacy_rules:
                    existing_rule = legacy_rules[0]
                    existing_accts = await get_quick_rule_accounts(
                        base_url, ps_auth, session_cookie, existing_rule["SmartRuleID"]
                    )
                    existing_ids = [str(a.get("ManagedAccountID", "")) for a in existing_accts]
                    merged = list(set(existing_ids + created_account_ids))
                    await update_quick_rule_accounts(
                        base_url, ps_auth, session_cookie, existing_rule["SmartRuleID"],
                        {"AccountIDs": merged, "Title": existing_rule["Title"],
                         "Category": existing_rule.get("Category", "Managed Account"),
                         "Description": existing_rule.get("Description", f"Auto-generated for {vm.name}")},
                    )
                    quick_rule_updated = True
                    quick_rule_name = existing_rule["Title"]
                else:
                    await create_quick_rule(base_url, ps_auth, session_cookie, {
                        "AccountIDs": created_account_ids, "Title": settings.quickrule,
                        "Category": "Managed Account", "Description": f"Auto-generated for {vm.name}",
                    })
                    quick_rule_updated = True
                    quick_rule_name = settings.quickrule

            # Determine onboarding type
            if not asset_created and not managed_system_created and accounts_created == 0:
                onboarding_type = "already_existed"
            elif not asset_created or not managed_system_created or accounts_existed > 0:
                onboarding_type = "partial"
            else:
                onboarding_type = "created"

            # Finalize
            await update_progress("completed", 5)
            await db.execute(
                update(SyncProgress).where(SyncProgress.id == progress_id).values(
                    status="completed", completed_at=datetime.now(timezone.utc)
                )
            )

            await db.execute(
                update(VirtualMachine).where(VirtualMachine.id == vm_id).values(
                    onboarding_status="completed", onboarding_type=onboarding_type, onboarding_error=None,
                )
            )

            db.add(OnboardingLog(
                vm_id=vm.id, status="completed",
                message="VM successfully onboarded to BeyondTrust",
                details={
                    "asset_id": asset_id, "managed_system_id": managed_system_id,
                    "managed_account_ids": created_account_ids,
                    "asset_created": asset_created, "system_created": managed_system_created,
                    "accounts_created": accounts_created, "accounts_existed": accounts_existed,
                    "onboarding_type": onboarding_type, "rule_used": rule_used,
                    "quick_rule_id": quick_rule_id, "quick_rule_name": quick_rule_name,
                    "quick_rule_updated": quick_rule_updated,
                },
            ))
            await db.commit()

        finally:
            await bt_signout(base_url, ps_auth, session_cookie)

        return {
            "success": True,
            "message": "VM successfully onboarded to BeyondTrust",
            "vm_id": vm_id,
            "asset_id": asset_id,
            "managed_system_id": managed_system_id,
            "managed_account_ids": created_account_ids,
        }

    except Exception as e:
        logger.error(f"Onboarding error for VM {vm_id}: {e}")
        try:
            await db.execute(
                update(VirtualMachine).where(VirtualMachine.id == vm_id).values(
                    onboarding_status="failed", onboarding_error=str(e),
                )
            )
            db.add(OnboardingLog(vm_id=vm_id, status="failed", message=str(e)))
            if progress_id:
                await db.execute(
                    update(SyncProgress).where(SyncProgress.id == progress_id).values(
                        status="failed", error_message=str(e),
                        completed_at=datetime.now(timezone.utc),
                    )
                )
            await db.commit()
        except Exception:
            pass
        return {"success": False, "error": str(e)}


# ─── Onboarding Cron (all zones with due schedules) ─────────────────────────

def _calculate_next_execution(schedule) -> datetime:
    """Calculate next execution time for a schedule."""
    now = datetime.now(timezone.utc)
    parts = (schedule.execution_time or "02:00").split(":")
    hours, minutes = int(parts[0]), int(parts[1]) if len(parts) > 1 else 0

    if schedule.frequency_type == "hourly":
        nxt = now + timedelta(hours=schedule.frequency_value or 1)
        return nxt.replace(minute=0, second=0, microsecond=0)
    elif schedule.frequency_type == "daily":
        nxt = now + timedelta(days=schedule.frequency_value or 1)
        return nxt.replace(hour=hours, minute=minutes, second=0, microsecond=0)
    elif schedule.frequency_type == "weekly":
        nxt = now + timedelta(weeks=schedule.frequency_value or 1)
        return nxt.replace(hour=hours, minute=minutes, second=0, microsecond=0)
    else:
        nxt = now + timedelta(days=1)
        return nxt.replace(hour=hours, minute=minutes, second=0, microsecond=0)


@router.post("/cron")
async def onboarding_cron(db: AsyncSession = Depends(get_db)):
    start_time = time.time()
    logger.info("[onboard-vms-cron] Starting scheduled onboarding check...")
    now = datetime.now(timezone.utc)

    try:
        # Fetch due schedules
        result = await db.execute(
            select(ZoneSchedule, Zone.id.label("z_id"), Zone.code, Zone.name)
            .join(Zone, ZoneSchedule.zone_id == Zone.id)
            .where(
                ZoneSchedule.schedule_type == "onboarding",
                ZoneSchedule.is_enabled.is_(True),
            )
            .where(
                (ZoneSchedule.next_execution_at.is_(None))
                | (ZoneSchedule.next_execution_at <= now)
            )
        )
        rows = result.all()

        if not rows:
            logger.info("[onboard-vms-cron] No onboarding schedules due")
            return {"message": "No onboarding schedules due", "zones_processed": 0}

        logger.info(f"[onboard-vms-cron] Found {len(rows)} zone(s) with due onboarding")
        results = []

        for schedule, zone_id, zone_code, zone_name in rows:
            zone_start = time.time()
            logger.info(f"[onboard-vms-cron] Processing zone: {zone_code} ({zone_name})")

            try:
                # Fetch pending running VMs for this zone
                vm_result = await db.execute(
                    select(VirtualMachine.id, VirtualMachine.name)
                    .where(
                        VirtualMachine.zone_id == zone_id,
                        VirtualMachine.onboarding_status == "pending",
                        VirtualMachine.power_state.in_(["running", "VM running"]),
                    )
                    .limit(schedule.batch_size or 10)
                )
                pending_vms = vm_result.all()

                if not pending_vms:
                    logger.info(f"[onboard-vms-cron] No pending VMs in zone {zone_code}")
                    await db.execute(
                        update(ZoneSchedule).where(ZoneSchedule.id == schedule.id).values(
                            last_execution_at=now,
                            next_execution_at=_calculate_next_execution(schedule),
                            last_status="success", last_error=None,
                        )
                    )
                    await db.commit()
                    results.append({
                        "zone_code": zone_code, "zone_name": zone_name,
                        "status": "skipped", "vms_processed": 0,
                        "vms_success": 0, "vms_failed": 0,
                        "duration_ms": int((time.time() - zone_start) * 1000),
                    })
                    continue

                success_count = 0
                failed_count = 0

                for vm_id, vm_name in pending_vms:
                    try:
                        r = await start_onboarding(OnboardRequest(vm_id=str(vm_id)), db=db)
                        if r.get("success"):
                            success_count += 1
                        else:
                            failed_count += 1
                    except Exception as e:
                        logger.error(f"[onboard-vms-cron] Error onboarding VM {vm_name}: {e}")
                        failed_count += 1
                    await asyncio.sleep(0.5)

                sched_status = "success" if failed_count == 0 else ("partial" if success_count > 0 else "failed")
                await db.execute(
                    update(ZoneSchedule).where(ZoneSchedule.id == schedule.id).values(
                        last_execution_at=now,
                        next_execution_at=_calculate_next_execution(schedule),
                        last_status=sched_status,
                        last_error=f"{failed_count} VMs failed" if failed_count > 0 else None,
                    )
                )
                await db.execute(
                    update(ZoneAzureConfig).where(ZoneAzureConfig.zone_id == zone_id).values(
                        last_onboarding_at=now,
                    )
                )
                await db.commit()

                results.append({
                    "zone_code": zone_code, "zone_name": zone_name,
                    "status": sched_status,
                    "vms_processed": len(pending_vms),
                    "vms_success": success_count, "vms_failed": failed_count,
                    "duration_ms": int((time.time() - zone_start) * 1000),
                })

            except Exception as e:
                logger.error(f"[onboard-vms-cron] Exception in zone {zone_code}: {e}")
                await db.execute(
                    update(ZoneSchedule).where(ZoneSchedule.id == schedule.id).values(
                        last_execution_at=now,
                        next_execution_at=_calculate_next_execution(schedule),
                        last_status="failed", last_error=str(e),
                    )
                )
                await db.commit()
                results.append({
                    "zone_code": zone_code, "zone_name": zone_name,
                    "status": "error", "vms_processed": 0,
                    "vms_success": 0, "vms_failed": 0,
                    "error_message": str(e),
                    "duration_ms": int((time.time() - zone_start) * 1000),
                })

            await asyncio.sleep(1)

        total_duration = int((time.time() - start_time) * 1000)
        sc = sum(1 for r in results if r["status"] == "success")
        ec = sum(1 for r in results if r["status"] == "error")

        db.add(SyncHistory(
            trigger_type="scheduled", schedule_type="onboarding",
            zones_processed=len(rows), results=results,
            status="partial" if ec > 0 and sc > 0 else ("failed" if ec > 0 else "completed"),
            duration_ms=total_duration,
        ))
        await db.commit()

        return {
            "message": "Scheduled onboarding completed",
            "zones_processed": len(rows),
            "success_count": sc, "error_count": ec,
            "duration_ms": total_duration, "results": results,
        }

    except Exception as e:
        logger.error(f"[onboard-vms-cron] Fatal error: {e}")
        return {"error": str(e), "message": "Scheduled onboarding failed"}


# ─── Onboarding Logs ────────────────────────────────────────────────────────

@router.get("/logs/{vm_id}")
async def get_onboarding_logs(vm_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(OnboardingLog)
        .where(OnboardingLog.vm_id == vm_id)
        .order_by(OnboardingLog.created_at.desc())
        .limit(50)
    )
    logs = result.scalars().all()
    return [
        {
            "id": str(log.id),
            "vm_id": str(log.vm_id),
            "status": log.status,
            "message": log.message,
            "details": log.details,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]
