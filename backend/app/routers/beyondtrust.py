import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.beyondtrust_cache import (
    BtFunctionalAccount, BtPasswordPolicy, BtPlatform,
    BtQuickRule, BtSyncStatus, BtWorkgroup,
)
from app.services.beyondtrust_service import bt_request, build_base_url, build_ps_auth_header
from app.services.credentials_service import get_secret

logger = logging.getLogger(__name__)
router = APIRouter()


class SyncCacheRequest(BaseModel):
    resource_type: str = "all"  # all | platforms | workgroups | functional_accounts | quick_rules | password_policies


async def _bt_login(base_url: str, ps_auth: str) -> dict:
    result = await bt_request(base_url, ps_auth, "POST", "Auth/SignAppin")
    if result.status != 200:
        return {"success": False, "error": f"Login failed: {result.status} - {result.body_text}"}
    cookie = result.headers.get("set-cookie", "")
    return {"success": True, "session_cookie": cookie}


async def _update_sync_status(db: AsyncSession, resource: str, status: str, items_count: int | None = None, error_message: str | None = None):
    now = datetime.now(timezone.utc)
    stmt = pg_insert(BtSyncStatus).values(
        resource_type=resource, status=status, updated_at=now,
        last_sync_at=now if status == "completed" else None,
        items_count=items_count or 0,
        error_message=error_message,
    ).on_conflict_do_update(
        index_elements=["resource_type"],
        set_={
            "status": status,
            "updated_at": now,
            **({"last_sync_at": now, "items_count": items_count or 0, "error_message": None} if status == "completed" else {}),
            **({"error_message": error_message} if status == "error" else {}),
        },
    )
    await db.execute(stmt)
    await db.commit()


@router.post("/sync-cache")
async def sync_beyondtrust_cache(body: SyncCacheRequest, db: AsyncSession = Depends(get_db)):
    bt_url = await get_secret(db, "beyondtrust_url")
    bt_ps_auth = await get_secret(db, "beyondtrust_ps_auth")
    bt_username = await get_secret(db, "beyondtrust_username")
    bt_password = await get_secret(db, "beyondtrust_password")

    if not bt_url or not bt_ps_auth or not bt_username or not bt_password:
        return {"success": False, "error": "BeyondTrust credentials not configured"}

    base_url = build_base_url(bt_url)
    ps_auth = build_ps_auth_header(bt_ps_auth, bt_username, bt_password)

    login = await _bt_login(base_url, ps_auth)
    if not login["success"]:
        return {"success": False, "error": login.get("error")}

    cookie = login.get("session_cookie", "")
    resource = body.resource_type
    results: dict = {}

    if resource in ("all", "platforms"):
        results["platforms"] = await _sync_platforms(db, base_url, ps_auth, cookie)

    if resource in ("all", "workgroups"):
        results["workgroups"] = await _sync_workgroups(db, base_url, ps_auth, cookie)

    if resource in ("all", "functional_accounts"):
        results["functional_accounts"] = await _sync_functional_accounts(db, base_url, ps_auth, cookie)

    if resource in ("all", "quick_rules"):
        results["quick_rules"] = await _sync_quick_rules(db, base_url, ps_auth, cookie)

    if resource in ("all", "password_policies"):
        results["password_policies"] = await _sync_password_policies(db, base_url, ps_auth, cookie)

    return {"success": True, "results": results}


async def _sync_platforms(db: AsyncSession, base_url: str, ps_auth: str, cookie: str) -> dict:
    try:
        await _update_sync_status(db, "platforms", "syncing")
        resp = await bt_request(base_url, ps_auth, "GET", "Platforms", session_cookie=cookie)
        if resp.status != 200:
            raise Exception(f"API returned {resp.status}")
        items = resp.json if isinstance(resp.json, list) else []
        now = datetime.now(timezone.utc)
        records = []
        for p in items:
            pid = p.get("PlatformID") or p.get("ID")
            if not pid:
                continue
            records.append({
                "platform_id": int(pid), "name": p.get("Name", ""),
                "short_name": p.get("ShortName"), "platform_type": p.get("PlatformType"),
                "port_number": p.get("PortNumber"), "description": p.get("Description"),
                "supports_password_management": p.get("SupportsPasswordManagement", False),
                "supports_session_management": p.get("SupportsSessionManagement", False),
                "synced_at": now,
            })
        if records:
            for r in records:
                stmt = pg_insert(BtPlatform).values(**r).on_conflict_do_update(
                    index_elements=["platform_id"], set_={k: v for k, v in r.items() if k != "platform_id"})
                await db.execute(stmt)
        api_ids = {r["platform_id"] for r in records}
        existing = (await db.execute(select(BtPlatform.platform_id))).scalars().all()
        to_delete = [eid for eid in existing if eid not in api_ids]
        if to_delete:
            await db.execute(delete(BtPlatform).where(BtPlatform.platform_id.in_(to_delete)))
        await db.commit()
        await _update_sync_status(db, "platforms", "completed", len(records))
        return {"success": True, "count": len(records)}
    except Exception as e:
        await _update_sync_status(db, "platforms", "error", error_message=str(e))
        return {"success": False, "error": str(e)}


async def _sync_workgroups(db: AsyncSession, base_url: str, ps_auth: str, cookie: str) -> dict:
    try:
        await _update_sync_status(db, "workgroups", "syncing")
        resp = await bt_request(base_url, ps_auth, "GET", "Workgroups", session_cookie=cookie)
        if resp.status != 200:
            raise Exception(f"API returned {resp.status}")
        items = resp.json if isinstance(resp.json, list) else []
        now = datetime.now(timezone.utc)
        records = []
        for w in items:
            wid = w.get("WorkgroupID") or w.get("ID")
            if not wid:
                continue
            records.append({"workgroup_id": int(wid), "name": w.get("Name", ""), "synced_at": now})
        if records:
            for r in records:
                stmt = pg_insert(BtWorkgroup).values(**r).on_conflict_do_update(
                    index_elements=["workgroup_id"], set_={k: v for k, v in r.items() if k != "workgroup_id"})
                await db.execute(stmt)
        api_ids = {r["workgroup_id"] for r in records}
        existing = (await db.execute(select(BtWorkgroup.workgroup_id))).scalars().all()
        to_delete = [eid for eid in existing if eid not in api_ids]
        if to_delete:
            await db.execute(delete(BtWorkgroup).where(BtWorkgroup.workgroup_id.in_(to_delete)))
        await db.commit()
        await _update_sync_status(db, "workgroups", "completed", len(records))
        return {"success": True, "count": len(records)}
    except Exception as e:
        await _update_sync_status(db, "workgroups", "error", error_message=str(e))
        return {"success": False, "error": str(e)}


async def _sync_functional_accounts(db: AsyncSession, base_url: str, ps_auth: str, cookie: str) -> dict:
    try:
        await _update_sync_status(db, "functional_accounts", "syncing")
        resp = await bt_request(base_url, ps_auth, "GET", "FunctionalAccounts", session_cookie=cookie)
        if resp.status != 200:
            raise Exception(f"API returned {resp.status}")
        items = resp.json if isinstance(resp.json, list) else []
        now = datetime.now(timezone.utc)
        records = []
        for a in items:
            aid = a.get("FunctionalAccountID") or a.get("ID")
            if not aid:
                continue
            records.append({
                "functional_account_id": int(aid),
                "display_name": a.get("DisplayName") or a.get("AccountName", ""),
                "account_name": a.get("AccountName", ""),
                "domain_name": a.get("DomainName"),
                "platform_id": a.get("PlatformID"),
                "description": a.get("Description"),
                "synced_at": now,
            })
        if records:
            for r in records:
                stmt = pg_insert(BtFunctionalAccount).values(**r).on_conflict_do_update(
                    index_elements=["functional_account_id"], set_={k: v for k, v in r.items() if k != "functional_account_id"})
                await db.execute(stmt)
        api_ids = {r["functional_account_id"] for r in records}
        existing = (await db.execute(select(BtFunctionalAccount.functional_account_id))).scalars().all()
        to_delete = [eid for eid in existing if eid not in api_ids]
        if to_delete:
            await db.execute(delete(BtFunctionalAccount).where(BtFunctionalAccount.functional_account_id.in_(to_delete)))
        await db.commit()
        await _update_sync_status(db, "functional_accounts", "completed", len(records))
        return {"success": True, "count": len(records)}
    except Exception as e:
        await _update_sync_status(db, "functional_accounts", "error", error_message=str(e))
        return {"success": False, "error": str(e)}


async def _sync_quick_rules(db: AsyncSession, base_url: str, ps_auth: str, cookie: str) -> dict:
    try:
        await _update_sync_status(db, "quick_rules", "syncing")
        resp = await bt_request(base_url, ps_auth, "GET", "QuickRules", session_cookie=cookie)
        if resp.status != 200:
            raise Exception(f"API returned {resp.status}")
        items = resp.json if isinstance(resp.json, list) else []
        now = datetime.now(timezone.utc)
        records = []
        for r in items:
            rid = r.get("QuickRuleID") or r.get("SmartRuleID") or r.get("ID")
            if not rid:
                continue
            records.append({
                "quick_rule_id": int(rid),
                "title": r.get("Title") or r.get("title", ""),
                "category": r.get("Category") or r.get("category"),
                "description": r.get("Description") or r.get("description"),
                "synced_at": now,
            })
        if records:
            for r in records:
                stmt = pg_insert(BtQuickRule).values(**r).on_conflict_do_update(
                    index_elements=["quick_rule_id"], set_={k: v for k, v in r.items() if k != "quick_rule_id"})
                await db.execute(stmt)
        api_ids = {r["quick_rule_id"] for r in records}
        existing = (await db.execute(select(BtQuickRule.quick_rule_id))).scalars().all()
        to_delete = [eid for eid in existing if eid not in api_ids]
        if to_delete:
            await db.execute(delete(BtQuickRule).where(BtQuickRule.quick_rule_id.in_(to_delete)))
        await db.commit()
        await _update_sync_status(db, "quick_rules", "completed", len(records))
        return {"success": True, "count": len(records)}
    except Exception as e:
        await _update_sync_status(db, "quick_rules", "error", error_message=str(e))
        return {"success": False, "error": str(e)}


async def _sync_password_policies(db: AsyncSession, base_url: str, ps_auth: str, cookie: str) -> dict:
    try:
        await _update_sync_status(db, "password_policies", "syncing")
        resp = await bt_request(base_url, ps_auth, "GET", "PasswordRules", session_cookie=cookie)
        if resp.status != 200:
            raise Exception(f"API returned {resp.status}")
        items = resp.json if isinstance(resp.json, list) else []
        now = datetime.now(timezone.utc)
        records = []
        for p in items:
            pid = p.get("PasswordRuleID") or p.get("ID")
            if not pid:
                continue
            records.append({
                "password_rule_id": int(pid),
                "name": p.get("Name") or p.get("Title", ""),
                "description": p.get("Description"),
                "minimum_length": p.get("MinimumLength") or p.get("MinLength"),
                "maximum_length": p.get("MaximumLength") or p.get("MaxLength"),
                "require_uppercase": p.get("RequireUpperCase") or p.get("RequireUppercase", False),
                "require_lowercase": p.get("RequireLowerCase") or p.get("RequireLowercase", False),
                "require_numbers": p.get("RequireNumbers") or p.get("RequireNumeric", False),
                "require_special_chars": p.get("RequireSpecialCharacters") or p.get("RequireSpecial", False),
                "synced_at": now,
            })
        if records:
            for r in records:
                stmt = pg_insert(BtPasswordPolicy).values(**r).on_conflict_do_update(
                    index_elements=["password_rule_id"], set_={k: v for k, v in r.items() if k != "password_rule_id"})
                await db.execute(stmt)
        api_ids = {r["password_rule_id"] for r in records}
        existing = (await db.execute(select(BtPasswordPolicy.password_rule_id))).scalars().all()
        to_delete = [eid for eid in existing if eid not in api_ids]
        if to_delete:
            await db.execute(delete(BtPasswordPolicy).where(BtPasswordPolicy.password_rule_id.in_(to_delete)))
        await db.commit()
        await _update_sync_status(db, "password_policies", "completed", len(records))
        return {"success": True, "count": len(records)}
    except Exception as e:
        await _update_sync_status(db, "password_policies", "error", error_message=str(e))
        return {"success": False, "error": str(e)}


# ---- Cache read endpoints ----

@router.get("/cache/platforms")
async def get_platforms(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BtPlatform).order_by(BtPlatform.name))
    return [_row_to_dict(r) for r in result.scalars().all()]


@router.get("/cache/workgroups")
async def get_workgroups(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BtWorkgroup).order_by(BtWorkgroup.name))
    return [_row_to_dict(r) for r in result.scalars().all()]


@router.get("/cache/policies")
async def get_policies(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BtPasswordPolicy).order_by(BtPasswordPolicy.name))
    return [_row_to_dict(r) for r in result.scalars().all()]


@router.get("/cache/functional-accounts")
async def get_functional_accounts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BtFunctionalAccount).order_by(BtFunctionalAccount.display_name))
    return [_row_to_dict(r) for r in result.scalars().all()]


@router.get("/cache/quick-rules")
async def get_quick_rules(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BtQuickRule).order_by(BtQuickRule.title))
    return [_row_to_dict(r) for r in result.scalars().all()]


@router.get("/sync-status")
async def get_sync_status(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BtSyncStatus))
    return [_row_to_dict(r) for r in result.scalars().all()]


@router.post("/proxy")
async def beyondtrust_proxy(body: dict, db: AsyncSession = Depends(get_db)):
    bt_url = await get_secret(db, "beyondtrust_url")
    bt_ps_auth = await get_secret(db, "beyondtrust_ps_auth")
    bt_username = await get_secret(db, "beyondtrust_username")
    bt_password = await get_secret(db, "beyondtrust_password")

    if not bt_url or not bt_ps_auth or not bt_username or not bt_password:
        return {"error": "BeyondTrust credentials not configured"}

    base_url = build_base_url(bt_url)
    ps_auth = build_ps_auth_header(bt_ps_auth, bt_username, bt_password)

    method = body.get("method", "GET")
    path = body.get("path", "")
    data = body.get("data")
    params = body.get("params")

    result = await bt_request(base_url, ps_auth, method, path, data=data, params=params)
    return {"status": result.status, "data": result.json, "body": result.body_text}


def _row_to_dict(row) -> dict:
    d = {}
    for c in row.__table__.columns:
        val = getattr(row, c.name if c.name != "metadata" else "metadata_")
        if hasattr(val, "isoformat"):
            val = val.isoformat()
        elif hasattr(val, "hex"):
            val = str(val)
        d[c.name] = val
    return d
