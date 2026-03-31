"""
Credentials service — uses Azure Key Vault exclusively.

All secrets are stored/retrieved from Azure Key Vault via Workload Identity.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings


# ─── Key Vault secret operations ─────────────────────────────────────

async def get_secret(db: AsyncSession, name: str) -> str | None:
    from app.services.keyvault_service import get_secret as kv_get
    return await kv_get(name)


async def set_secret(db: AsyncSession, name: str, value: str, description: str | None = None) -> None:
    from app.services.keyvault_service import set_secret as kv_set
    return await kv_set(name, value, description)


async def delete_secret(db: AsyncSession, name: str) -> bool:
    from app.services.keyvault_service import delete_secret as kv_del
    return await kv_del(name)


async def get_secret_masked(db: AsyncSession, name: str) -> str | None:
    value = await get_secret(db, name)
    if value is None:
        return None
    if len(value) <= 8:
        return value[:2] + "****"
    return value[:4] + "****" + value[-4:]


# ─── Provider credential operations ───────────────────────────────────

CREDENTIAL_KEYS = {
    "azure": ["tenant_id", "client_id", "client_secret"],
    "beyondtrust": ["url", "ps_auth", "username", "password"],
    "microsoft_sso": ["tenant_id", "client_id", "client_secret"],
}


async def save_provider_credentials(
    db: AsyncSession,
    provider: str,
    credentials: dict[str, str],
    zone_code: str | None = None,
) -> list[str]:
    # Handle special providers
    if provider == "azure_groups":
        saved = []
        for role in ("admin", "operator", "viewer"):
            value = credentials.get(role)
            if value:
                secret_name = f"azure_group_{role}"
                await set_secret(db, secret_name, value, f"Azure AD Group ID for {role} role")
                saved.append(secret_name)
        return saved

    if provider == "microsoft_sso_toggle":
        enabled = credentials.get("enabled", "true")
        await set_secret(db, "microsoft_sso_enabled", enabled, "Microsoft SSO enabled/disabled")
        return ["microsoft_sso_enabled"]

    keys = CREDENTIAL_KEYS.get(provider)
    if not keys:
        raise ValueError(f"Invalid provider: {provider}")

    saved = []
    for key in keys:
        value = credentials.get(key)
        if value:
            if provider == "azure" and zone_code:
                secret_name = f"azure_{key}_{zone_code}"
            else:
                secret_name = f"{provider}_{key}"

            desc = f"{provider} {key} credential"
            if zone_code:
                desc += f" for zone {zone_code}"

            await set_secret(db, secret_name, value, desc)
            saved.append(secret_name)

    return saved
