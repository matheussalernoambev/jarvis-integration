"""
Keycloak OIDC authentication service.

Validates JWT tokens issued by Keycloak and extracts user info + roles.
Keycloak is mandatory — all requests must be authenticated via OIDC.
"""

import httpx
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import settings

_jwks_cache: dict | None = None
_oidc_config_cache: dict | None = None

security = HTTPBearer(auto_error=True)


async def _get_oidc_config() -> dict:
    """Fetch OIDC discovery document from Keycloak."""
    global _oidc_config_cache
    if _oidc_config_cache is not None:
        return _oidc_config_cache

    url = f"{settings.keycloak_url}/realms/{settings.keycloak_realm}/.well-known/openid-configuration"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        _oidc_config_cache = resp.json()
        return _oidc_config_cache


async def _get_jwks() -> dict:
    """Fetch JWKS (public keys) from Keycloak for token verification."""
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache

    config = await _get_oidc_config()
    jwks_uri = config["jwks_uri"]
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(jwks_uri)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        return _jwks_cache


def _extract_roles(token_payload: dict) -> list[str]:
    """Extract realm roles and client roles from Keycloak token."""
    roles = []

    # Realm roles
    realm_access = token_payload.get("realm_access", {})
    roles.extend(realm_access.get("roles", []))

    # Client-specific roles
    resource_access = token_payload.get("resource_access", {})
    client_roles = resource_access.get(settings.keycloak_client_id, {})
    roles.extend(client_roles.get("roles", []))

    return roles


def _resolve_app_role(keycloak_roles: list[str]) -> str:
    """Map Keycloak roles to application role (admin > operator > viewer)."""
    if "admin" in keycloak_roles:
        return "admin"
    if "operator" in keycloak_roles:
        return "operator"
    return "viewer"


async def validate_token(token: str) -> dict:
    """
    Validate a Keycloak JWT token and return user info.
    Returns dict with: id, email, name, role, roles, groups
    """
    try:
        jwks = await _get_jwks()
        config = await _get_oidc_config()

        # Decode without verification first to get the key ID
        unverified = jwt.get_unverified_header(token)
        kid = unverified.get("kid")

        # Find the matching key
        rsa_key = None
        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                rsa_key = key
                break

        if not rsa_key:
            raise HTTPException(status_code=401, detail="Token signing key not found")

        # Verify and decode
        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=["RS256"],
            audience=settings.keycloak_client_id,
            issuer=config["issuer"],
        )

        keycloak_roles = _extract_roles(payload)
        app_role = _resolve_app_role(keycloak_roles)

        return {
            "id": payload.get("sub"),
            "email": payload.get("email", ""),
            "name": payload.get("preferred_username", payload.get("name", "")),
            "role": app_role,
            "roles": keycloak_roles,
            "groups": payload.get("groups", []),
        }

    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    FastAPI dependency that returns the current authenticated user.
    Keycloak is mandatory — no mock fallback.
    """
    if not settings.keycloak_enabled:
        raise HTTPException(
            status_code=503,
            detail="Keycloak is not configured. Set KEYCLOAK_URL, KEYCLOAK_REALM, and KEYCLOAK_CLIENT_ID.",
        )

    return await validate_token(credentials.credentials)


def require_role(*allowed_roles: str):
    """
    FastAPI dependency factory that checks if the user has one of the allowed roles.
    Usage: Depends(require_role("admin", "operator"))
    """
    async def _check(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Role '{user['role']}' not authorized. Required: {', '.join(allowed_roles)}",
            )
        return user
    return _check
