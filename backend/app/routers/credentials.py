import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.services.credentials_service import (
    get_secret,
    get_secret_masked,
    save_provider_credentials,
)

router = APIRouter()


class SaveCredentialsRequest(BaseModel):
    provider: str  # azure | beyondtrust | microsoft_sso
    credentials: dict[str, str]
    zone_code: str | None = None


class TestConnectionRequest(BaseModel):
    provider: str  # azure | beyondtrust
    zone_code: str | None = None


@router.post("/save")
async def save_credentials(body: SaveCredentialsRequest, db: AsyncSession = Depends(get_db)):
    try:
        saved = await save_provider_credentials(db, body.provider, body.credentials, body.zone_code)
        return {
            "success": True,
            "message": f"{len(saved)} credentials saved successfully",
            "saved": saved,
            "zone": body.zone_code or "global",
        }
    except ValueError as e:
        return {"success": False, "error": str(e)}


@router.post("/test")
async def test_connection(body: TestConnectionRequest, db: AsyncSession = Depends(get_db)):
    if body.provider == "azure":
        return await _test_azure(db, body.zone_code)
    elif body.provider == "beyondtrust":
        return await _test_beyondtrust(db)
    return {"success": False, "error": "Invalid provider"}


@router.get("/azure-status")
async def get_azure_status(zone_code: str | None = None, db: AsyncSession = Depends(get_db)):
    suffix = f"_{zone_code}" if zone_code else ""
    tenant = await get_secret(db, f"azure_tenant_id{suffix}")
    client = await get_secret(db, f"azure_client_id{suffix}")
    configured = bool(tenant and client)
    return {"configured": configured}


@router.get("/sso-status")
async def get_sso_status(db: AsyncSession = Depends(get_db)):
    tenant = await get_secret(db, "microsoft_sso_tenant_id")
    configured = bool(tenant)
    enabled_val = await get_secret(db, "microsoft_sso_enabled")
    enabled = enabled_val != "false" if enabled_val is not None else True
    return {"configured": configured, "enabled": enabled}


@router.get("/beyondtrust")
async def get_beyondtrust_status(db: AsyncSession = Depends(get_db)):
    url = await get_secret_masked(db, "beyondtrust_url")
    ps_auth = await get_secret_masked(db, "beyondtrust_ps_auth")
    username = await get_secret_masked(db, "beyondtrust_username")
    configured = bool(url and ps_auth and username)
    return {
        "configured": configured,
        "url": url,
        "ps_auth": ps_auth,
        "username": username,
    }


@router.get("/sso-login-config")
async def get_sso_login_config(db: AsyncSession = Depends(get_db)):
    """Return SSO credentials needed for PKCE OAuth login flow."""
    tenant = await get_secret(db, "microsoft_sso_tenant_id")
    client = await get_secret(db, "microsoft_sso_client_id")
    enabled_val = await get_secret(db, "microsoft_sso_enabled")
    enabled = enabled_val != "false" if enabled_val is not None else True

    if not tenant or not client or not enabled:
        return {"configured": False}

    return {
        "configured": True,
        "tenant_id": tenant,
        "client_id": client,
    }


@router.get("/azure-groups")
async def get_azure_groups(db: AsyncSession = Depends(get_db)):
    admin = await get_secret(db, "azure_group_admin")
    operator = await get_secret(db, "azure_group_operator")
    viewer = await get_secret(db, "azure_group_viewer")
    return {"admin": admin, "operator": operator, "viewer": viewer}


async def _test_azure(db: AsyncSession, zone_code: str | None = None) -> dict:
    suffix = f"_{zone_code}" if zone_code else ""
    tenant_id = await get_secret(db, f"azure_tenant_id{suffix}")
    client_id = await get_secret(db, f"azure_client_id{suffix}")
    client_secret = await get_secret(db, f"azure_client_secret{suffix}")

    if not tenant_id or not client_id or not client_secret:
        label = f" for zone {zone_code}" if zone_code else ""
        return {"success": False, "error": f"Azure credentials not configured{label}"}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
            resp = await client.post(
                token_url,
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "scope": "https://management.azure.com/.default",
                    "grant_type": "client_credentials",
                },
            )

            if resp.status_code != 200:
                return {"success": False, "error": "Azure authentication failed", "details": resp.text}

            access_token = resp.json().get("access_token")

            subs_resp = await client.get(
                "https://management.azure.com/subscriptions?api-version=2020-01-01",
                headers={"Authorization": f"Bearer {access_token}"},
            )

            if subs_resp.status_code != 200:
                return {"success": False, "error": "Failed to access Azure subscriptions"}

            subs = [
                {"id": s["subscriptionId"], "name": s["displayName"], "state": s["state"]}
                for s in subs_resp.json().get("value", [])
            ]

            return {
                "success": True,
                "message": "Azure connection successful",
                "details": f"Found {len(subs)} accessible subscription(s)",
                "subscriptions": subs,
            }
    except Exception as e:
        return {"success": False, "error": str(e)}


async def _test_beyondtrust(db: AsyncSession) -> dict:
    bt_url = await get_secret(db, "beyondtrust_url")
    bt_ps_auth = await get_secret(db, "beyondtrust_ps_auth")
    bt_username = await get_secret(db, "beyondtrust_username")
    bt_password = await get_secret(db, "beyondtrust_password")

    if not bt_url or not bt_ps_auth or not bt_username or not bt_password:
        return {"success": False, "error": "BeyondTrust credentials not configured"}

    try:
        base_url = bt_url.rstrip("/")
        sign_in_url = f"{base_url}/BeyondTrust/api/public/v3/Auth/SignAppin"
        auth_header = f"PS-Auth key={bt_ps_auth}; runas={bt_username}; pwd=[{bt_password}];"

        headers = {
            "Authorization": auth_header,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        proxy_url = settings.http11_proxy_url
        if proxy_url:
            from urllib.parse import urlparse
            parsed = urlparse(sign_in_url)
            fetch_url = f"{proxy_url}{parsed.path}"
            headers["X-Target-Host"] = parsed.netloc
        else:
            fetch_url = sign_in_url

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(fetch_url, headers=headers, content="{}")

            if resp.status_code == 200:
                # Sign out
                sign_out_url = fetch_url.replace("SignAppin", "Signout")
                cookies = resp.headers.get("set-cookie", "")
                sign_out_headers = {**headers}
                if cookies:
                    sign_out_headers["Cookie"] = cookies
                await client.post(sign_out_url, headers=sign_out_headers, content="{}")

                return {
                    "success": True,
                    "message": "BeyondTrust connection successful",
                    "details": "PS-Auth authentication verified",
                }
            else:
                return {
                    "success": False,
                    "error": f"BeyondTrust authentication failed (HTTP {resp.status_code})",
                    "details": resp.text[:500],
                }
    except Exception as e:
        return {"success": False, "error": str(e)}
