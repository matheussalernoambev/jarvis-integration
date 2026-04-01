"""
Managed Accounts Service - Fetches and enriches ALL managed accounts
from BeyondTrust Password Safe API, replicating the "Download All" behavior.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.onboarding import OnboardingRule
from app.models.password_failure import PasswordFailure, PasswordFailureSnapshot
from app.models.zone import Zone
from app.services.beyondtrust_service import (
    bt_login,
    bt_logout,
    bt_request,
    build_base_url,
    build_ps_auth_header,
)
from app.services.credentials_service import get_secret
from app.services.password_failures_service import parse_failure_reason, resolve_zone_id

logger = logging.getLogger(__name__)

CHANGE_STATE_MAP = {
    0: "Not Changed",
    1: "Changed",
    2: "Changed",
    3: "Change Failed",
    4: "Change Failed",
    5: "Test Pending",
    6: "Test In Progress",
    7: "Test Succeeded",
    8: "Test Failed",
}

PAGE_SIZE = 1000


async def _fetch_paginated(
    base_url: str,
    ps_auth: str,
    cookie: str,
    path: str,
    page_size: int = PAGE_SIZE,
    proxy_url: str | None = None,
) -> list[dict]:
    """Fetch all records from a paginated BT API endpoint."""
    all_items: list[dict] = []
    offset = 0

    while True:
        resp = await bt_request(
            base_url, ps_auth, "GET", path,
            params={"limit": page_size, "offset": offset},
            session_cookie=cookie,
            proxy_url=proxy_url,
        )
        if resp.status != 200:
            raise Exception(f"GET {path} returned {resp.status}: {resp.body_text[:200]}")

        data = resp.json
        if isinstance(data, dict) and "Data" in data:
            items = data["Data"]
            total = data.get("TotalCount", len(items))
        elif isinstance(data, list):
            items = data
            total = len(data)
        else:
            break

        all_items.extend(items)
        offset += page_size

        if offset >= total or len(items) == 0:
            break

        logger.info(f"[ManagedAccounts] Fetched {len(all_items)}/{total} from {path}")

    return all_items


async def _fetch_reference_data(
    base_url: str, ps_auth: str, cookie: str, proxy_url: str | None = None,
) -> tuple[dict[int, str], dict[int, str], dict[int, str]]:
    """Fetch workgroups, platforms, and password rules as lookup maps."""
    workgroup_map: dict[int, str] = {}
    platform_map: dict[int, str] = {}
    rule_map: dict[int, str] = {}

    # Workgroups
    resp = await bt_request(base_url, ps_auth, "GET", "Workgroups", session_cookie=cookie, proxy_url=proxy_url)
    if resp.status == 200 and isinstance(resp.json, list):
        for w in resp.json:
            wid = w.get("WorkgroupID") or w.get("ID")
            if wid:
                workgroup_map[int(wid)] = w.get("Name", "")

    # Platforms
    resp = await bt_request(base_url, ps_auth, "GET", "Platforms", session_cookie=cookie, proxy_url=proxy_url)
    if resp.status == 200 and isinstance(resp.json, list):
        for p in resp.json:
            pid = p.get("PlatformID") or p.get("ID")
            if pid:
                platform_map[int(pid)] = p.get("Name", "")

    # Password Rules
    resp = await bt_request(base_url, ps_auth, "GET", "PasswordRules", session_cookie=cookie, proxy_url=proxy_url)
    if resp.status == 200 and isinstance(resp.json, list):
        for r in resp.json:
            rid = r.get("PasswordRuleID") or r.get("ID")
            if rid:
                rule_map[int(rid)] = r.get("Name") or r.get("Title", "")

    logger.info(
        f"[ManagedAccounts] Reference data: {len(workgroup_map)} workgroups, "
        f"{len(platform_map)} platforms, {len(rule_map)} password rules"
    )
    return workgroup_map, platform_map, rule_map


def _parse_bt_datetime(value) -> datetime | None:
    """Parse BT API datetime string to Python datetime."""
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        s = str(value).replace("Z", "+00:00")
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def _enrich_account(
    acct: dict,
    system_map: dict[int, dict],
    workgroup_map: dict[int, str],
    platform_map: dict[int, str],
    rule_map: dict[int, str],
) -> dict:
    """Enrich a single managed account with system/workgroup/platform/rule data.

    Note: The BT API returns different field names depending on the endpoint:
    - ManagedAccounts (requestable): AccountId, SystemId, SystemName, PlatformID
    - ManagedAccounts (provisioning): ManagedAccountID, ManagedSystemID, etc.
    This function handles both variants.
    """
    # Handle both field name variants
    ms_id = acct.get("ManagedSystemID") or acct.get("SystemId")
    system = system_map.get(int(ms_id), {}) if ms_id else {}

    # Account uses SystemName directly; system record has more details
    acct_system_name = acct.get("SystemName") or ""

    # Resolve names from IDs
    wg_id = acct.get("WorkgroupID") or system.get("WorkgroupID")
    platform_id = acct.get("PlatformID") or system.get("PlatformID")
    rule_id = acct.get("PasswordRuleID") or system.get("PasswordRuleID")

    workgroup_name = workgroup_map.get(int(wg_id), "") if wg_id else ""
    platform_name = platform_map.get(int(platform_id), "") if platform_id else ""
    password_rule_name = rule_map.get(int(rule_id), "") if rule_id else ""

    change_state = acct.get("ChangeState")
    change_state_int = int(change_state) if change_state is not None else None
    change_state_desc = CHANGE_STATE_MAP.get(change_state_int, "Unknown") if change_state_int is not None else None

    # AutoManagementFlag comes from the system, not the account
    auto_mgmt = acct.get("AutoManagementFlag")
    if auto_mgmt is None:
        auto_mgmt = system.get("AutoManagementFlag")

    return {
        "managed_account_id": acct.get("ManagedAccountID") or acct.get("AccountId"),
        "managed_system_id": int(ms_id) if ms_id else None,
        "account_name": acct.get("AccountName", ""),
        "system_name": system.get("SystemName") or acct_system_name,
        "domain_name": acct.get("DomainName"),
        "platform_name": platform_name or None,
        "workgroup_id": int(wg_id) if wg_id else None,
        "workgroup_name": workgroup_name,
        "host_name": system.get("HostName"),
        "ip_address": system.get("IPAddress"),
        "dns_name": system.get("DnsName") or system.get("DNSName"),
        "distinguished_name": acct.get("DistinguishedName"),
        "sam_account_name": acct.get("SAMAccountName"),
        "user_principal_name": acct.get("UserPrincipalName"),
        "change_state": change_state_int,
        "change_state_description": change_state_desc,
        "auto_management_flag": auto_mgmt,
        "password_rule_name": password_rule_name or None,
        "last_change_date": _parse_bt_datetime(acct.get("LastChangeDate")),
        "next_change_date": _parse_bt_datetime(acct.get("NextChangeDate")),
        "change_frequency_type": acct.get("ChangeFrequencyType") or system.get("ChangeFrequencyType"),
        "change_frequency_days": acct.get("ChangeFrequencyDays") or system.get("ChangeFrequencyDays"),
        "release_duration": acct.get("DefaultReleaseDuration") or acct.get("ReleaseDuration") or system.get("ReleaseDuration"),
        "max_release_duration": acct.get("MaximumReleaseDuration") or acct.get("MaxReleaseDuration") or system.get("MaxReleaseDuration"),
        "api_enabled": acct.get("ApiEnabled"),
        "last_change_result": acct.get("LastChangeResult") if acct.get("LastChangeResult") else None,
        "platform_id_raw": platform_id,
        "api_account_data": acct,
    }


def _categorize_record(enriched: dict) -> str | None:
    """Determine record_type. Returns None if account is healthy (skip)."""
    auto_mgmt = enriched.get("auto_management_flag")
    cs = enriched.get("change_state")

    if auto_mgmt is False:
        return "automanage_disabled"
    if cs in (3, 4, 8):  # Change Failed or Test Failed
        return "failure"
    return None  # Healthy account, don't persist in failures table


async def _resolve_zones(db: AsyncSession) -> tuple[list[dict], dict[str, str]]:
    """Load active zones and build OnboardingRule workgroup->zone mapping."""
    zr = await db.execute(select(Zone.id, Zone.code).where(Zone.is_active.is_(True)))
    zones = [{"id": str(r.id), "code": r.code} for r in zr.all()]

    # OnboardingRule mapping: workgroup_id (str) -> zone_id (str)
    or_result = await db.execute(select(OnboardingRule.workgroup_id, OnboardingRule.zone_id))
    wg_zone_map: dict[str, str] = {}
    for row in or_result.all():
        if row.workgroup_id and row.zone_id:
            wg_zone_map[str(row.workgroup_id)] = str(row.zone_id)

    return zones, wg_zone_map


async def sync_all_managed_accounts(db: AsyncSession) -> dict:
    """
    Full sync: fetch ALL managed accounts from BT API, enrich, categorize,
    and upsert failures/automanage_disabled into password_failures table.
    """
    bt_url = await get_secret(db, "beyondtrust_url")
    bt_ps_auth = await get_secret(db, "beyondtrust_ps_auth")
    bt_username = await get_secret(db, "beyondtrust_username")
    bt_password = await get_secret(db, "beyondtrust_password")

    if not bt_url or not bt_ps_auth or not bt_username or not bt_password:
        return {"success": False, "error": "BeyondTrust credentials not configured"}

    base_url = build_base_url(bt_url)
    ps_auth = build_ps_auth_header(bt_ps_auth, bt_username, bt_password)

    login_result = await bt_login(base_url, ps_auth)
    if not login_result["success"]:
        return {"success": False, "error": login_result.get("error")}

    cookie = login_result.get("session_cookie", "")
    now = datetime.now(timezone.utc)

    try:
        # 1. Fetch reference data
        workgroup_map, platform_map, rule_map = await _fetch_reference_data(base_url, ps_auth, cookie)

        # 2. Fetch all managed systems (paginated)
        raw_systems = await _fetch_paginated(base_url, ps_auth, cookie, "ManagedSystems")
        system_map: dict[int, dict] = {}
        for s in raw_systems:
            sid = s.get("ManagedSystemID")
            if sid:
                system_map[int(sid)] = s
        logger.info(f"[ManagedAccounts] Fetched {len(system_map)} managed systems")

        # 3. Fetch all managed accounts (paginated)
        raw_accounts = await _fetch_paginated(base_url, ps_auth, cookie, "ManagedAccounts")
        logger.info(f"[ManagedAccounts] Fetched {len(raw_accounts)} managed accounts")

        # 4. Enrich and categorize
        zones, wg_zone_map = await _resolve_zones(db)
        upserted_ids: set[int] = set()
        stats = {"total_fetched": len(raw_accounts), "failures": 0, "automanage_disabled": 0, "skipped": 0, "stale_removed": 0}

        for acct in raw_accounts:
            enriched = _enrich_account(acct, system_map, workgroup_map, platform_map, rule_map)
            record_type = _categorize_record(enriched)

            if record_type is None:
                stats["skipped"] += 1
                continue

            # Resolve zone
            zone_id = None
            wg_id = enriched.get("workgroup_id")
            if wg_id:
                zone_id = wg_zone_map.get(str(wg_id))
            if not zone_id and enriched.get("workgroup_name"):
                zone_id = resolve_zone_id(enriched["workgroup_name"], zones)

            ma_id = enriched.get("managed_account_id")
            if ma_id:
                upserted_ids.add(int(ma_id))

            rec = {
                "managed_account_id": ma_id,
                "managed_system_id": enriched["managed_system_id"],
                "account_name": enriched["account_name"],
                "system_name": enriched["system_name"],
                "domain_name": enriched["domain_name"],
                "platform_name": enriched["platform_name"],
                "workgroup_id": enriched["workgroup_id"],
                "workgroup_name": enriched["workgroup_name"],
                "zone_id": zone_id,
                "host_name": enriched["host_name"],
                "ip_address": enriched["ip_address"],
                "dns_name": enriched["dns_name"],
                "distinguished_name": enriched["distinguished_name"],
                "sam_account_name": enriched["sam_account_name"],
                "user_principal_name": enriched["user_principal_name"],
                "change_state": enriched["change_state"],
                "change_state_description": enriched["change_state_description"],
                "auto_management_flag": enriched["auto_management_flag"],
                "password_rule_name": enriched["password_rule_name"],
                "last_change_date": enriched["last_change_date"],
                "next_change_date": enriched["next_change_date"],
                "change_frequency_type": enriched["change_frequency_type"],
                "change_frequency_days": enriched["change_frequency_days"],
                "release_duration": enriched["release_duration"],
                "max_release_duration": enriched["max_release_duration"],
                "api_enabled": enriched["api_enabled"],
                "last_change_result": enriched["last_change_result"],
                "failure_reason": parse_failure_reason(enriched["last_change_result"]) if record_type == "failure" else None,
                "synced_at": now,
                "import_source": "api",
                "record_type": record_type,
                "api_account_data": enriched["api_account_data"],
            }

            # Upsert using managed_account_id as conflict target
            if ma_id:
                stmt = pg_insert(PasswordFailure).values(**rec)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["managed_account_id"],
                    set_={k: v for k, v in rec.items() if k not in ("managed_account_id", "first_failure_at")},
                )
                await db.execute(stmt)
            else:
                # Fallback: use composite constraint
                stmt = pg_insert(PasswordFailure).values(**rec)
                stmt = stmt.on_conflict_do_update(
                    constraint="uq_pf_upsert_key",
                    set_={k: v for k, v in rec.items() if k not in ("account_name", "system_name", "record_type", "import_source", "workgroup_name", "first_failure_at")},
                )
                await db.execute(stmt)

            stats[record_type.replace("automanage_disabled", "automanage_disabled")] += 1

        await db.commit()

        # 5. Delete stale API records
        if upserted_ids:
            stale_result = await db.execute(
                delete(PasswordFailure)
                .where(
                    PasswordFailure.import_source == "api",
                    PasswordFailure.managed_account_id.isnot(None),
                    PasswordFailure.managed_account_id.notin_(upserted_ids),
                )
                .returning(func.count())
            )
            stale_count = stale_result.scalar() or 0
            stats["stale_removed"] = stale_count
            await db.commit()

        # 6. Create snapshots
        zone_code_map = {z["id"]: z["code"] for z in zones}
        for rt in ("failure", "automanage_disabled"):
            snap_r = await db.execute(
                select(PasswordFailure.zone_id, func.count().label("cnt"))
                .where(
                    PasswordFailure.import_source == "api",
                    PasswordFailure.record_type == rt,
                    PasswordFailure.zone_id.isnot(None),
                )
                .group_by(PasswordFailure.zone_id)
            )
            for row in snap_r.all():
                db.add(PasswordFailureSnapshot(
                    zone_id=row.zone_id,
                    zone_code=zone_code_map.get(str(row.zone_id), ""),
                    total_failures=row.cnt,
                    import_source="api",
                    record_type=rt,
                ))
        await db.commit()

        logger.info(f"[ManagedAccounts] Sync complete: {stats}")
        return {"success": True, **stats}

    except Exception as e:
        logger.error(f"[ManagedAccounts] Sync error: {e}", exc_info=True)
        return {"success": False, "error": str(e)}

    finally:
        await bt_logout(base_url, ps_auth, cookie)


async def fetch_all_managed_accounts_enriched(db: AsyncSession) -> list[dict]:
    """
    Fetch ALL managed accounts from BT API with full enrichment.
    Returns list of dicts (not persisted) for CSV/XLSX export.
    """
    bt_url = await get_secret(db, "beyondtrust_url")
    bt_ps_auth = await get_secret(db, "beyondtrust_ps_auth")
    bt_username = await get_secret(db, "beyondtrust_username")
    bt_password = await get_secret(db, "beyondtrust_password")

    if not bt_url or not bt_ps_auth or not bt_username or not bt_password:
        raise Exception("BeyondTrust credentials not configured")

    base_url = build_base_url(bt_url)
    ps_auth = build_ps_auth_header(bt_ps_auth, bt_username, bt_password)

    login_result = await bt_login(base_url, ps_auth)
    if not login_result["success"]:
        raise Exception(login_result.get("error", "Login failed"))

    cookie = login_result.get("session_cookie", "")

    try:
        workgroup_map, platform_map, rule_map = await _fetch_reference_data(base_url, ps_auth, cookie)

        raw_systems = await _fetch_paginated(base_url, ps_auth, cookie, "ManagedSystems")
        system_map: dict[int, dict] = {}
        for s in raw_systems:
            sid = s.get("ManagedSystemID")
            if sid:
                system_map[int(sid)] = s

        raw_accounts = await _fetch_paginated(base_url, ps_auth, cookie, "ManagedAccounts")

        enriched_list = []
        for acct in raw_accounts:
            enriched = _enrich_account(acct, system_map, workgroup_map, platform_map, rule_map)
            # For export: include all accounts (not just failures)
            enriched.pop("platform_id_raw", None)
            enriched.pop("api_account_data", None)
            enriched_list.append(enriched)

        return enriched_list

    finally:
        await bt_logout(base_url, ps_auth, cookie)
