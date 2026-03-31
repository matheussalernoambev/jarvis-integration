"""
Azure Key Vault secrets provider.

When secrets_backend=keyvault, all credential operations go through Azure Key Vault
instead of the app_secrets database table. Uses DefaultAzureCredential which supports:
- Managed Identity (AKS workload identity — production)
- Azure CLI credential (local dev)
- Environment variables (AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID)
"""

from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient

from app.config import settings

_client: SecretClient | None = None


def _get_client() -> SecretClient:
    global _client
    if _client is None:
        credential = DefaultAzureCredential()
        _client = SecretClient(vault_url=settings.azure_keyvault_url, credential=credential)
    return _client


def _to_kv_name(name: str) -> str:
    """Convert app secret name to Key Vault compatible name (alphanumeric + hyphens only)."""
    return name.replace("_", "-")


def _from_kv_name(kv_name: str) -> str:
    """Convert Key Vault name back to app secret name."""
    return kv_name.replace("-", "_")


async def get_secret(name: str) -> str | None:
    """Get a secret from Azure Key Vault."""
    try:
        client = _get_client()
        secret = client.get_secret(_to_kv_name(name))
        return secret.value
    except Exception:
        return None


async def set_secret(name: str, value: str, description: str | None = None) -> None:
    """Set a secret in Azure Key Vault."""
    client = _get_client()
    tags = {}
    if description:
        tags["description"] = description[:256]
    client.set_secret(_to_kv_name(name), value, tags=tags)


async def delete_secret(name: str) -> bool:
    """Delete a secret from Azure Key Vault."""
    try:
        client = _get_client()
        client.begin_delete_secret(_to_kv_name(name))
        return True
    except Exception:
        return False


async def get_secret_masked(name: str) -> str | None:
    """Get a secret from Key Vault with value masked."""
    value = await get_secret(name)
    if value is None:
        return None
    if len(value) <= 8:
        return value[:2] + "****"
    return value[:4] + "****" + value[-4:]
