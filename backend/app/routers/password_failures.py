import csv
import io
import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.onboarding import OnboardingRule
from app.models.password_failure import ImportJob, PasswordFailure, PasswordFailureSnapshot
from app.models.zone import Zone
from app.services.credentials_service import get_secret
from app.services.managed_accounts_service import (
    fetch_all_managed_accounts_enriched,
    sync_all_managed_accounts,
)
from app.services.password_failures_service import (
    parse_csv_records,
    parse_failure_reason,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── List Password Failures ─────────────────────────────────────────────────

@router.get("")
async def list_password_failures(
    record_type: str | None = Query(None),
    zone_id: str | None = Query(None),
    search: str | None = Query(None),
    import_source: str | None = Query(None),
    limit: int = Query(500, le=50000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    query = select(PasswordFailure)

    if record_type:
        query = query.where(PasswordFailure.record_type == record_type)
    if zone_id:
        query = query.where(PasswordFailure.zone_id == zone_id)
    if import_source:
        query = query.where(PasswordFailure.import_source == import_source)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            PasswordFailure.account_name.ilike(pattern)
            | PasswordFailure.system_name.ilike(pattern)
            | PasswordFailure.workgroup_name.ilike(pattern)
        )

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(PasswordFailure.synced_at.desc()).limit(limit).offset(offset)
    rows = (await db.execute(query)).scalars().all()

    return {
        "data": [_pf_to_dict(pf) for pf in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# ─── Sync Password Failures (from BT API) ───────────────────────────────────

@router.post("/sync")
async def sync_password_failures(db: AsyncSession = Depends(get_db)):
    logger.info("[PasswordFailures] Starting sync...")

    bt_url = await get_secret(db, "beyondtrust_url")
    bt_ps_auth = await get_secret(db, "beyondtrust_ps_auth")
    bt_username = await get_secret(db, "beyondtrust_username")
    bt_password = await get_secret(db, "beyondtrust_password")

    if not bt_url or not bt_ps_auth or not bt_username or not bt_password:
        return {"success": False, "error": "BeyondTrust not configured"}

    base_url = bt_url.rstrip("/") + "/BeyondTrust/api/public/v3"
    auth_header = f"PS-Auth key={bt_ps_auth}; runas={bt_username}; pwd=[{bt_password}];"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # Authenticate
            resp = await client.post(
                f"{base_url}/Auth/SignAppin",
                headers={"Authorization": auth_header, "Content-Type": "application/json"},
                content="{}",
            )
            if resp.status_code != 200:
                return {"success": False, "error": f"Auth failed: {resp.status_code}"}

            cookie = resp.headers.get("set-cookie", "")

            try:
                # Fetch managed accounts with failed state
                accts_resp = await client.get(
                    f"{base_url}/ManagedAccounts?status=failed&limit=1000",
                    headers={"Cookie": cookie, "Content-Type": "application/json"},
                )

                if accts_resp.status_code != 200:
                    return {"success": False, "error": f"Failed to fetch accounts: {accts_resp.status_code}"}

                all_accounts = accts_resp.json() or []
                failed_accounts = [
                    a for a in all_accounts
                    if a.get("ChangeState") == "Failed"
                    or (a.get("LastChangeResult") or "").lower().find("fail") >= 0
                ]

                logger.info(f"[PasswordFailures] Found {len(failed_accounts)} failed accounts")

                system_cache: dict[int, dict | None] = {}
                platform_cache: dict[int, dict | None] = {}
                processed = []

                for acct in failed_accounts:
                    ms_id = acct.get("ManagedSystemID")
                    system = None
                    if ms_id:
                        if ms_id not in system_cache:
                            sr = await client.get(
                                f"{base_url}/ManagedSystems/{ms_id}",
                                headers={"Cookie": cookie},
                            )
                            system_cache[ms_id] = sr.json() if sr.status_code == 200 else None
                        system = system_cache[ms_id]

                    platform_name = None
                    pid = (system or {}).get("PlatformID") or acct.get("PlatformID")
                    if pid:
                        if pid not in platform_cache:
                            pr = await client.get(
                                f"{base_url}/Platforms/{pid}",
                                headers={"Cookie": cookie},
                            )
                            platform_cache[pid] = pr.json() if pr.status_code == 200 else None
                        platform_name = (platform_cache[pid] or {}).get("Name")

                    # Resolve zone from workgroup
                    wg_id = (system or {}).get("WorkgroupID")
                    zone_id = None
                    if wg_id:
                        rr = await db.execute(
                            select(OnboardingRule.zone_id)
                            .where(OnboardingRule.workgroup_id == str(wg_id))
                            .limit(1)
                        )
                        row = rr.first()
                        zone_id = str(row.zone_id) if row else None

                    processed.append({
                        "managed_account_id": acct.get("ManagedAccountID"),
                        "account_name": acct.get("AccountName", ""),
                        "managed_system_id": ms_id,
                        "system_name": (system or {}).get("SystemName") or acct.get("SystemName", ""),
                        "platform_name": platform_name,
                        "workgroup_id": wg_id,
                        "workgroup_name": (system or {}).get("WorkgroupName", ""),
                        "zone_id": zone_id,
                        "last_change_attempt": acct.get("LastChangeDate"),
                        "last_change_result": acct.get("LastChangeResult"),
                        "failure_reason": parse_failure_reason(acct.get("LastChangeResult")),
                        "synced_at": datetime.now(timezone.utc).isoformat(),
                        "import_source": "api",
                        "record_type": "failure",
                    })

                # Upsert
                for rec in processed:
                    stmt = pg_insert(PasswordFailure).values(**rec)
                    stmt = stmt.on_conflict_do_update(
                        constraint="uq_pf_upsert_key",
                        set_={
                            "managed_account_id": stmt.excluded.managed_account_id,
                            "managed_system_id": stmt.excluded.managed_system_id,
                            "platform_name": stmt.excluded.platform_name,
                            "workgroup_id": stmt.excluded.workgroup_id,
                            "zone_id": stmt.excluded.zone_id,
                            "last_change_attempt": stmt.excluded.last_change_attempt,
                            "last_change_result": stmt.excluded.last_change_result,
                            "failure_reason": stmt.excluded.failure_reason,
                            "synced_at": stmt.excluded.synced_at,
                        },
                    )
                    await db.execute(stmt)
                await db.commit()

                return {
                    "success": True,
                    "processed": len(processed),
                    "message": f"{len(processed)} password failures synced",
                }

            finally:
                # Sign out
                try:
                    await client.post(f"{base_url}/Auth/Signout", headers={"Cookie": cookie})
                except Exception:
                    pass

    except Exception as e:
        logger.error(f"[PasswordFailures] Sync error: {e}")
        return {"success": False, "error": str(e)}


# ─── Import Password Failures (CSV) ─────────────────────────────────────────

@router.post("/import")
async def import_password_failures(
    file: UploadFile = File(...),
    mode: str = Form("diff"),
    chunkIndex: int = Form(1),
    totalChunks: int = Form(1),
    jobId: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    logger.info(f"[import] Processing chunk {chunkIndex}/{totalChunks}, mode={mode}, jobId={jobId}")

    csv_text = (await file.read()).decode("utf-8")

    current_job_id = jobId
    batch_date: str

    if not current_job_id and chunkIndex == 1:
        batch_date = datetime.now(timezone.utc).isoformat()
        job = ImportJob(status="processing", mode=mode, total_lines=totalChunks, stats={"batchDate": batch_date})
        db.add(job)
        await db.commit()
        await db.refresh(job)
        current_job_id = str(job.id)
        logger.info(f"[import] Created job {current_job_id}")
    elif current_job_id:
        jr = await db.execute(select(ImportJob.stats).where(ImportJob.id == current_job_id))
        job_stats = jr.scalar_one_or_none()
        batch_date = (job_stats or {}).get("batchDate", datetime.now(timezone.utc).isoformat())
    else:
        return {"success": False, "error": "Missing jobId for chunk > 1"}

    # Load zones
    zr = await db.execute(select(Zone.id, Zone.code).where(Zone.is_active.is_(True)))
    zones = [{"id": str(r.id), "code": r.code} for r in zr.all()]

    records, stats = parse_csv_records(csv_text, zones, current_job_id, batch_date)

    # Replace mode: clear on first chunk
    if mode == "replace" and chunkIndex == 1:
        await db.execute(delete(PasswordFailure).where(PasswordFailure.import_source == "csv"))
        await db.commit()

    # Upsert records
    if records:
        for rec in records:
            stmt = pg_insert(PasswordFailure).values(**rec)
            stmt = stmt.on_conflict_do_update(
                constraint="uq_pf_upsert_key",
                set_={
                    "domain_name": stmt.excluded.domain_name,
                    "platform_name": stmt.excluded.platform_name,
                    "zone_id": stmt.excluded.zone_id,
                    "last_change_attempt": stmt.excluded.last_change_attempt,
                    "failure_reason": stmt.excluded.failure_reason,
                    "import_batch_date": stmt.excluded.import_batch_date,
                    "synced_at": stmt.excluded.synced_at,
                    "last_import_job_id": stmt.excluded.last_import_job_id,
                },
            )
            await db.execute(stmt)
        await db.commit()
        stats["inserted"] = len(records)

    # Update job progress
    await db.execute(
        update(ImportJob).where(ImportJob.id == current_job_id).values(
            processed_lines=chunkIndex, stats={**stats, "batchDate": batch_date},
        )
    )
    await db.commit()

    is_last = chunkIndex == totalChunks

    if is_last:
        final_stats = {**stats, "batchDate": batch_date}

        # Diff mode: delete stale records
        if mode == "diff":
            stale_r = await db.execute(
                select(PasswordFailure.id, PasswordFailure.account_name, PasswordFailure.system_name)
                .where(
                    PasswordFailure.import_source == "csv",
                    PasswordFailure.last_import_job_id != current_job_id,
                )
            )
            stale_null = await db.execute(
                select(PasswordFailure.id, PasswordFailure.account_name, PasswordFailure.system_name)
                .where(
                    PasswordFailure.import_source == "csv",
                    PasswordFailure.last_import_job_id.is_(None),
                )
            )
            stale_rows = stale_r.all() + stale_null.all()

            if stale_rows:
                stale_ids = [r.id for r in stale_rows]
                deleted_names = [
                    f"{r.system_name}\\{r.account_name}" if r.system_name else r.account_name
                    for r in stale_rows
                ]
                await db.execute(delete(PasswordFailure).where(PasswordFailure.id.in_(stale_ids)))
                await db.commit()
                final_stats["deleted"] = len(stale_ids)
                final_stats["deletedAccounts"] = deleted_names[:100]

        # Record snapshots
        for rt in ("failure", "automanage_disabled"):
            snap_r = await db.execute(
                select(PasswordFailure.zone_id, func.count().label("cnt"))
                .where(
                    PasswordFailure.import_source == "csv",
                    PasswordFailure.record_type == rt,
                    PasswordFailure.zone_id.isnot(None),
                )
                .group_by(PasswordFailure.zone_id)
            )
            zone_code_map = {z["id"]: z["code"] for z in zones}
            for row in snap_r.all():
                db.add(PasswordFailureSnapshot(
                    zone_id=row.zone_id,
                    zone_code=zone_code_map.get(str(row.zone_id), ""),
                    total_failures=row.cnt,
                    import_source="csv",
                    record_type=rt,
                ))
            await db.commit()

        # Mark job completed
        await db.execute(
            update(ImportJob).where(ImportJob.id == current_job_id).values(
                status="completed", processed_lines=totalChunks, stats=final_stats,
                completed_at=datetime.now(timezone.utc),
            )
        )
        await db.commit()

        return {
            "success": True, "jobId": current_job_id,
            "status": "completed", "chunkIndex": chunkIndex,
            "totalChunks": totalChunks, "stats": final_stats,
        }

    return {
        "success": True, "jobId": current_job_id,
        "status": "processing", "chunkIndex": chunkIndex,
        "totalChunks": totalChunks, "stats": stats,
    }


# ─── Import Jobs ─────────────────────────────────────────────────────────────

@router.get("/import-jobs")
async def list_import_jobs(
    limit: int = Query(20, le=100),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ImportJob).order_by(ImportJob.created_at.desc()).limit(limit)
    )
    jobs = result.scalars().all()
    return [
        {
            "id": str(j.id), "status": j.status, "mode": j.mode,
            "total_lines": j.total_lines, "processed_lines": j.processed_lines,
            "stats": j.stats, "error_message": j.error_message,
            "created_at": j.created_at.isoformat() if j.created_at else None,
            "completed_at": j.completed_at.isoformat() if j.completed_at else None,
        }
        for j in jobs
    ]


# ─── Snapshots (for charts) ─────────────────────────────────────────────────

@router.get("/snapshots")
async def list_snapshots(
    record_type: str | None = Query(None),
    zone_id: str | None = Query(None),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
):
    query = select(PasswordFailureSnapshot).order_by(PasswordFailureSnapshot.snapshot_date.desc())
    if record_type:
        query = query.where(PasswordFailureSnapshot.record_type == record_type)
    if zone_id:
        query = query.where(PasswordFailureSnapshot.zone_id == zone_id)
    query = query.limit(limit)

    result = await db.execute(query)
    snaps = result.scalars().all()
    return [
        {
            "id": str(s.id),
            "snapshot_date": s.snapshot_date.isoformat() if s.snapshot_date else None,
            "zone_id": str(s.zone_id) if s.zone_id else None,
            "zone_code": s.zone_code,
            "total_failures": s.total_failures,
            "import_source": s.import_source,
            "record_type": s.record_type,
        }
        for s in snaps
    ]


# ─── Sync Managed Accounts (full BT API fetch) ────────────────────────────────

@router.post("/sync-managed-accounts")
async def sync_managed_accounts(db: AsyncSession = Depends(get_db)):
    """Full sync of all managed accounts from BeyondTrust API."""
    logger.info("[ManagedAccounts] Starting full sync...")
    result = await sync_all_managed_accounts(db)
    return result


@router.post("/sync-managed-accounts-cron")
async def sync_managed_accounts_cron(db: AsyncSession = Depends(get_db)):
    """CronJob wrapper for managed accounts sync."""
    logger.info("[ManagedAccounts] Cron-triggered sync starting...")
    try:
        result = await sync_all_managed_accounts(db)
        if result.get("success"):
            return {
                "success": True,
                "message": (
                    f"Synced {result.get('failures', 0)} failures, "
                    f"{result.get('automanage_disabled', 0)} automanage disabled, "
                    f"{result.get('stale_removed', 0)} stale removed "
                    f"(from {result.get('total_fetched', 0)} total accounts)"
                ),
            }
        return {"success": False, "message": result.get("error", "Unknown error")}
    except Exception as e:
        logger.error(f"[ManagedAccounts] Cron sync error: {e}")
        return {"success": False, "message": str(e)}


# ─── Export ────────────────────────────────────────────────────────────────────

@router.get("/export")
async def export_password_failures(
    format: str = Query("csv"),
    record_type: str | None = Query(None),
    source: str | None = Query(None),
    all_accounts: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """Export password failures as CSV. If all_accounts=true, fetches ALL from BT API."""
    if all_accounts:
        try:
            enriched = await fetch_all_managed_accounts_enriched(db)
        except Exception as e:
            return {"success": False, "error": str(e)}

        export_columns = [
            "managed_account_id", "account_name", "domain_name",
            "distinguished_name", "user_principal_name", "sam_account_name",
            "managed_system_id", "system_name", "host_name", "ip_address", "dns_name",
            "platform_name", "workgroup_name",
            "change_state", "change_state_description", "auto_management_flag",
            "last_change_date", "next_change_date", "last_change_result",
            "change_frequency_type", "change_frequency_days",
            "password_rule_name", "release_duration", "max_release_duration",
            "api_enabled",
        ]

        output = io.StringIO()
        output.write("\ufeff")  # UTF-8 BOM for Excel
        writer = csv.DictWriter(output, fieldnames=export_columns, extrasaction="ignore")
        writer.writeheader()
        for row in enriched:
            clean = {}
            for k in export_columns:
                v = row.get(k)
                if isinstance(v, datetime):
                    clean[k] = v.isoformat()
                elif v is None:
                    clean[k] = ""
                else:
                    clean[k] = v
            writer.writerow(clean)

        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"managed_accounts_all_{ts}.csv"

    else:
        # Export from database
        query = select(PasswordFailure)
        if record_type:
            query = query.where(PasswordFailure.record_type == record_type)
        if source:
            query = query.where(PasswordFailure.import_source == source)
        query = query.order_by(PasswordFailure.synced_at.desc())

        rows = (await db.execute(query)).scalars().all()

        export_columns = [
            "account_name", "system_name", "domain_name", "platform_name",
            "workgroup_name", "host_name", "ip_address", "dns_name",
            "change_state_description", "failure_reason", "last_change_result",
            "auto_management_flag", "last_change_date", "next_change_date",
            "password_rule_name", "change_frequency_type", "change_frequency_days",
            "import_source", "record_type", "synced_at",
        ]

        output = io.StringIO()
        output.write("\ufeff")  # UTF-8 BOM
        writer = csv.DictWriter(output, fieldnames=export_columns)
        writer.writeheader()
        for pf in rows:
            row_dict = {}
            for col in export_columns:
                v = getattr(pf, col, None)
                if isinstance(v, datetime):
                    row_dict[col] = v.isoformat()
                elif v is None:
                    row_dict[col] = ""
                else:
                    row_dict[col] = v
            writer.writerow(row_dict)

        rt_label = record_type or "all"
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"password_failures_{rt_label}_{ts}.csv"

    content = output.getvalue()
    output.close()

    return StreamingResponse(
        iter([content]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _pf_to_dict(pf: PasswordFailure) -> dict:
    return {
        "id": str(pf.id),
        "managed_account_id": pf.managed_account_id,
        "managed_system_id": pf.managed_system_id,
        "account_name": pf.account_name,
        "system_name": pf.system_name,
        "domain_name": pf.domain_name,
        "platform_name": pf.platform_name,
        "workgroup_id": pf.workgroup_id,
        "workgroup_name": pf.workgroup_name,
        "zone_id": str(pf.zone_id) if pf.zone_id else None,
        "failure_count": pf.failure_count,
        "failure_reason": pf.failure_reason,
        "last_change_attempt": pf.last_change_attempt.isoformat() if pf.last_change_attempt else None,
        "last_change_result": pf.last_change_result,
        "first_failure_at": pf.first_failure_at.isoformat() if pf.first_failure_at else None,
        "import_source": pf.import_source,
        "record_type": pf.record_type,
        "synced_at": pf.synced_at.isoformat() if pf.synced_at else None,
        # Enrichment fields
        "host_name": pf.host_name,
        "ip_address": pf.ip_address,
        "dns_name": pf.dns_name,
        "change_state": pf.change_state,
        "change_state_description": pf.change_state_description,
        "auto_management_flag": pf.auto_management_flag,
        "last_change_date": pf.last_change_date.isoformat() if pf.last_change_date else None,
        "next_change_date": pf.next_change_date.isoformat() if pf.next_change_date else None,
    }
