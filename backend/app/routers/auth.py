import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.services.credentials_service import get_secret
from app.services.keycloak_service import get_current_user, validate_token

router = APIRouter()


class MicrosoftCallbackRequest(BaseModel):
    code: str
    code_verifier: str
    redirect_uri: str


class EmailLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/microsoft-callback")
async def microsoft_auth_callback(body: MicrosoftCallbackRequest, db: AsyncSession = Depends(get_db)):
    """Exchange Microsoft OAuth code for tokens and user info."""
    tenant_id = await get_secret(db, "microsoft_sso_tenant_id")
    client_id = await get_secret(db, "microsoft_sso_client_id")
    client_secret = await get_secret(db, "microsoft_sso_client_secret")

    if not tenant_id or not client_id or not client_secret:
        return {"success": False, "error": "SSO not configured"}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            token_resp = await client.post(
                f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token",
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "code": body.code,
                    "code_verifier": body.code_verifier,
                    "redirect_uri": body.redirect_uri,
                    "grant_type": "authorization_code",
                    "scope": "openid email profile User.Read",
                },
            )

            if token_resp.status_code != 200:
                return {
                    "success": False,
                    "error": f"Token exchange failed: {token_resp.status_code}",
                    "details": token_resp.text[:500],
                }

            tokens = token_resp.json()
            access_token = tokens.get("access_token")

            profile_resp = await client.get(
                "https://graph.microsoft.com/v1.0/me",
                headers={"Authorization": f"Bearer {access_token}"},
            )

            if profile_resp.status_code != 200:
                return {"success": False, "error": "Failed to fetch user profile"}

            profile = profile_resp.json()

            groups_resp = await client.get(
                "https://graph.microsoft.com/v1.0/me/memberOf",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            group_ids = []
            if groups_resp.status_code == 200:
                group_ids = [
                    g["id"] for g in groups_resp.json().get("value", [])
                    if g.get("@odata.type") == "#microsoft.graph.group"
                ]

            admin_group = await get_secret(db, "azure_group_admin")
            operator_group = await get_secret(db, "azure_group_operator")
            viewer_group = await get_secret(db, "azure_group_viewer")

            role = "viewer"
            if admin_group and admin_group in group_ids:
                role = "admin"
            elif operator_group and operator_group in group_ids:
                role = "operator"

            return {
                "success": True,
                "user": {
                    "id": profile.get("id"),
                    "email": profile.get("mail") or profile.get("userPrincipalName"),
                    "name": profile.get("displayName"),
                    "role": role,
                    "group_ids": group_ids,
                },
                "access_token": access_token,
            }

    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/login")
async def email_login(body: EmailLoginRequest):
    """
    Email/password login.
    When Keycloak is enabled, delegates to Keycloak's token endpoint.
    Otherwise accepts mock credentials (admin@local / admin).
    """
    if settings.keycloak_enabled:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                token_resp = await client.post(
                    f"{settings.keycloak_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/token",
                    data={
                        "client_id": settings.keycloak_client_id,
                        "client_secret": settings.keycloak_client_secret,
                        "grant_type": "password",
                        "username": body.email,
                        "password": body.password,
                        "scope": "openid email profile",
                    },
                )

                if token_resp.status_code != 200:
                    return {"success": False, "error": "Invalid credentials"}

                tokens = token_resp.json()
                user_info = await validate_token(tokens["access_token"])

                return {
                    "success": True,
                    "user": user_info,
                    "access_token": tokens["access_token"],
                    "refresh_token": tokens.get("refresh_token"),
                }
        except Exception as e:
            return {"success": False, "error": str(e)}

    # Mock mode
    if body.email == "admin@local" and body.password == "admin":
        return {
            "success": True,
            "user": {
                "id": "00000000-0000-0000-0000-000000000000",
                "email": body.email,
                "role": "admin",
            },
            "access_token": "mock-token",
        }
    return {"success": False, "error": "Invalid credentials"}


@router.post("/logout")
async def logout():
    """Logout — in Keycloak mode could revoke tokens; currently no-op."""
    return {"success": True}


@router.get("/session")
async def get_session(user: dict = Depends(get_current_user)):
    """Get current session — validates token if Keycloak is enabled."""
    return {
        "user": user,
        "access_token": "valid",
    }


@router.get("/config")
async def get_auth_config():
    """Return auth configuration for the frontend (which provider to use)."""
    if settings.keycloak_enabled:
        return {
            "provider": "keycloak",
            "keycloak_url": settings.keycloak_url,
            "keycloak_realm": settings.keycloak_realm,
            "keycloak_client_id": settings.keycloak_client_id,
        }
    return {"provider": "mock"}
