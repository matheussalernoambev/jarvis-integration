from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database (Azure PostgreSQL Flexible Server)
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/jarvis"

    # Server
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    # HTTP/1.1 proxy for BeyondTrust Cloud (optional)
    http11_proxy_url: str = ""

    # Azure Key Vault (mandatory in production)
    azure_keyvault_url: str = ""  # e.g. https://jarvis-kv.vault.azure.net/

    # Keycloak OIDC (mandatory)
    keycloak_url: str = ""  # e.g. https://keycloak.company.com
    keycloak_realm: str = ""
    keycloak_client_id: str = ""
    keycloak_client_secret: str = ""

    @property
    def keycloak_enabled(self) -> bool:
        return bool(self.keycloak_url and self.keycloak_realm and self.keycloak_client_id)

    @property
    def keyvault_enabled(self) -> bool:
        return bool(self.azure_keyvault_url)


settings = Settings()
