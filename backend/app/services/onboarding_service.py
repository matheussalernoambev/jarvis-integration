"""
Onboarding Service - port of supabase/functions/onboard-beyondtrust/index.ts

Features:
- Create/find Asset + Managed System + Managed Accounts in BeyondTrust
- Dynamic onboarding rules per zone/platform/domain
- Quick Rule management
- Domain detection + account type resolution (AD/Local)
- Template-based descriptions
"""

import logging
import re
from typing import Any

from app.services.beyondtrust_service import BtApiResult, bt_request

logger = logging.getLogger(__name__)


# ─── Platform/Policy Resolution ─────────────────────────────────────────────

def resolve_platform_and_policy(os_type: str) -> dict:
    """Fallback platform+policy resolution from OS type."""
    os = os_type.lower()
    if "win" in os or "windows" in os:
        return {"platform": 1, "policy": 1}
    if "linux" in os:
        return {"platform": 2, "policy": 2}
    if "solaris" in os:
        return {"platform": 3, "policy": 2}
    if "aix" in os:
        return {"platform": 4, "policy": 2}
    if any(x in os for x in ("vsphere", "esxi", "vcenter")):
        return {"platform": 35, "policy": 2}
    if any(x in os for x in ("as400", "ibm i", "ibmi")):
        return {"platform": 1000, "policy": 4}
    if "sap" in os and ("arp" in os or "auto rotation" in os):
        return {"platform": 1001, "policy": 11}
    if "sap" in os:
        return {"platform": 45, "policy": 8}
    logger.warning(f"Unknown OS type: {os_type}, using Linux defaults")
    return {"platform": 2, "policy": 2}


def get_platform_id_from_os_type(os_type: str) -> int:
    """Derive BeyondTrust Platform ID from VM os_type (exact match)."""
    os = os_type.lower()

    # Windows
    if "windows" in os:
        return 1
    # Linux family
    if any(x in os for x in ("linux", "ubuntu", "centos", "rhel", "debian", "suse", "fedora", "amazon linux")):
        return 2
    if "solaris" in os or "sunos" in os:
        return 3
    if "aix" in os:
        return 4
    if "hp-ux" in os or "hpux" in os:
        return 5
    if any(x in os for x in ("macos", "mac os", "osx")):
        return 31
    # Databases
    if "oracle db" in os or "oracle database" in os:
        return 8
    if "sybase" in os:
        return 9
    if "mysql" in os:
        return 10
    if "mssql" in os or "sql server" in os:
        return 11
    if "db2" in os:
        return 12
    if "informix" in os:
        return 13
    if "postgresql" in os or "postgres" in os:
        return 14
    if "mongodb" in os:
        return 74
    if "teradata" in os:
        return 43
    if "saphana" in os or "sap hana" in os:
        return 48
    # Network
    if "cisco ios" in os:
        return 15
    if "cisco pix" in os or "cisco asa" in os:
        return 16
    if "junos" in os or "juniper" in os:
        return 17
    if "f5" in os or "big-ip" in os:
        return 18
    if "palo alto" in os:
        return 19
    if "fortinet" in os or "fortigate" in os:
        return 20
    if "checkpoint" in os:
        return 21
    if "sonicwall" in os:
        return 22
    # Virtualization
    if any(x in os for x in ("vsphere", "esxi", "vcenter")):
        return 35
    if "hyperv" in os or "hyper-v" in os:
        return 36
    # IBM
    if any(x in os for x in ("as400", "ibmi", "ibm i")):
        return 37
    if any(x in os for x in ("zos", "z/os", "mainframe")):
        return 38
    if "racf" in os:
        return 39
    if "tss" in os or "top secret" in os:
        return 40
    if "acf2" in os:
        return 41
    # SAP
    if "sap" in os:
        return 45
    # Directory
    if "active directory" in os or " ad " in os:
        return 25
    if "ldap" in os:
        return 26
    # Cloud
    if "aws" in os and "iam" in os:
        return 50
    if "azure" in os and "ad" in os:
        return 51

    logger.warning(f'Unknown OS type: "{os_type}", defaulting to Linux/Unix SSH (platform 2)')
    return 2


def generate_description(template: str, variables: dict) -> str:
    """Generate description from template with {{variable}} placeholders."""
    result = template
    for key, value in variables.items():
        result = result.replace(f"{{{{{key}}}}}", str(value or ""))
    return result


# ─── BeyondTrust API Wrappers ───────────────────────────────────────────────

async def bt_login(base_url: str, ps_auth: str) -> str:
    """Login to BeyondTrust and capture session cookie."""
    logger.info("[BT-LOGIN] Authenticating with BeyondTrust...")
    result = await bt_request(base_url, ps_auth, "POST", "Auth/SignAppin", data="")

    if result.status >= 400:
        raise Exception(f"BeyondTrust login failed ({result.status}): {result.body_text}")

    logger.info(f"[BT-LOGIN] Response status: {result.status}")

    headers = result.headers or {}
    set_cookie = headers.get("set-cookie", "") or headers.get("Set-Cookie", "")

    session_cookie = ""

    # Priority 1: ASP.NET_SessionId (BeyondTrust Cloud)
    match = re.search(r"ASP\.NET_SessionId=[^;]+", set_cookie)
    if match:
        session_cookie = match.group(0)
        logger.info(f"[BT-LOGIN] Found ASP.NET_SessionId")

    # Priority 2: BTSID (On-Premises)
    if not session_cookie:
        match = re.search(r"BTSID=[^;]+", set_cookie)
        if match:
            session_cookie = match.group(0)
            logger.info(f"[BT-LOGIN] Found BTSID")

    # Priority 3: Session in response body
    if not session_cookie and result.json and isinstance(result.json, dict):
        body_session = (
            result.json.get("SessionId")
            or result.json.get("sessionId")
            or result.json.get("Token")
        )
        if body_session:
            session_cookie = f"ASP.NET_SessionId={body_session}"
            logger.info("[BT-LOGIN] Found session in response body")

    if not session_cookie:
        logger.error("[BT-LOGIN] No session cookie found!")
    else:
        logger.info("[BT-LOGIN] Session cookie captured successfully")

    return session_cookie


async def bt_call(
    base_url: str,
    ps_auth: str,
    method: str,
    path: str,
    session_cookie: str,
    *,
    data: Any = None,
    params: dict | None = None,
) -> Any:
    """BT API call that raises on error."""
    logger.info(f"[BT API] {method} {path}")
    result = await bt_request(
        base_url, ps_auth, method, path,
        data=data, params=params, session_cookie=session_cookie,
    )
    if result.status >= 400:
        raise Exception(f"BeyondTrust API error ({result.status}): {result.body_text}")
    return result.json


async def bt_call_search(
    base_url: str,
    ps_auth: str,
    method: str,
    path: str,
    session_cookie: str,
    *,
    data: Any = None,
    params: dict | None = None,
) -> list:
    """BT API search call: returns empty list on 404."""
    logger.info(f"[BT API Search] {method} {path}")
    result = await bt_request(
        base_url, ps_auth, method, path,
        data=data, params=params, session_cookie=session_cookie,
    )
    if result.status == 404:
        return []
    if result.status >= 400:
        raise Exception(f"BeyondTrust API error ({result.status}): {result.body_text}")
    return result.json if isinstance(result.json, list) else ([] if result.json is None else [result.json])


async def bt_signout(base_url: str, ps_auth: str, session_cookie: str):
    """Sign out from BeyondTrust."""
    try:
        await bt_request(base_url, ps_auth, "POST", "Auth/Signout", session_cookie=session_cookie)
    except Exception:
        pass


# ─── High-Level BT Operations ───────────────────────────────────────────────

async def search_asset(base_url: str, ps_auth: str, cookie: str, name: str) -> list:
    return await bt_call_search(base_url, ps_auth, "POST", "Assets/Search", cookie, data={"AssetName": name})


async def create_asset(base_url: str, ps_auth: str, cookie: str, workgroup_id: str, data: dict) -> dict:
    return await bt_call(base_url, ps_auth, "POST", f"Workgroups/{workgroup_id}/Assets", cookie, data=data)


async def update_asset(base_url: str, ps_auth: str, cookie: str, asset_id: str, data: dict):
    return await bt_call(base_url, ps_auth, "PUT", f"Assets/{asset_id}", cookie, data=data)


async def search_managed_system(base_url: str, ps_auth: str, cookie: str, name: str) -> list:
    return await bt_call_search(base_url, ps_auth, "GET", "ManagedSystems", cookie, params={"name": name})


async def get_managed_system_by_id(base_url: str, ps_auth: str, cookie: str, ms_id: str) -> dict:
    return await bt_call(base_url, ps_auth, "GET", f"ManagedSystems/{ms_id}", cookie)


async def create_managed_system(base_url: str, ps_auth: str, cookie: str, asset_id: str, data: dict) -> dict:
    return await bt_call(base_url, ps_auth, "POST", f"Assets/{asset_id}/ManagedSystems", cookie, data=data)


async def update_managed_system(base_url: str, ps_auth: str, cookie: str, ms_id: str, data: dict):
    return await bt_call(base_url, ps_auth, "PUT", f"ManagedSystems/{ms_id}", cookie, data=data)


async def get_managed_accounts_of_system(base_url: str, ps_auth: str, cookie: str, ms_id: str, account_name: str) -> list:
    return await bt_call_search(base_url, ps_auth, "GET", f"ManagedSystems/{ms_id}/ManagedAccounts", cookie, params={"name": account_name})


async def create_managed_account(base_url: str, ps_auth: str, cookie: str, ms_id: str, data: dict) -> dict:
    return await bt_call(base_url, ps_auth, "POST", f"ManagedSystems/{ms_id}/ManagedAccounts", cookie, data=data)


async def get_functional_accounts(base_url: str, ps_auth: str, cookie: str) -> list:
    result = await bt_call(base_url, ps_auth, "GET", "FunctionalAccounts", cookie)
    return result if isinstance(result, list) else []


async def search_quick_rule(base_url: str, ps_auth: str, cookie: str, title: str) -> list:
    return await bt_call_search(base_url, ps_auth, "GET", "QuickRules", cookie, params={"title": title})


async def get_quick_rule_accounts(base_url: str, ps_auth: str, cookie: str, qr_id: str) -> list:
    return await bt_call_search(base_url, ps_auth, "GET", f"QuickRules/{qr_id}/ManagedAccounts", cookie)


async def create_quick_rule(base_url: str, ps_auth: str, cookie: str, data: dict) -> dict:
    return await bt_call(base_url, ps_auth, "POST", "QuickRules", cookie, data=data)


async def update_quick_rule_accounts(base_url: str, ps_auth: str, cookie: str, qr_id: str, data: dict):
    return await bt_call(base_url, ps_auth, "PUT", f"QuickRules/{qr_id}/ManagedAccounts", cookie, data=data)


async def add_accounts_to_quick_rule(
    base_url: str, ps_auth: str, cookie: str,
    quick_rule_id: str, new_account_ids: list[str],
):
    """Merge new accounts into existing Quick Rule."""
    existing = await bt_call(base_url, ps_auth, "GET", f"QuickRules/{quick_rule_id}/ManagedAccounts", cookie)
    existing_ids = [str(a.get("ManagedAccountID", "")) for a in (existing if isinstance(existing, list) else [])]
    all_ids = list(set(existing_ids + new_account_ids))
    logger.info(f"Quick Rule {quick_rule_id}: {len(existing_ids)} existing + {len(new_account_ids)} new = {len(all_ids)} total")
    return await bt_call(base_url, ps_auth, "PUT", f"QuickRules/{quick_rule_id}/ManagedAccounts", cookie, data={"AccountIDs": all_ids})
