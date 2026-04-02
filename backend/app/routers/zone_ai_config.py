import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.zone_ai_config import ZoneAiConfig
from app.services.credentials_service import get_secret, get_secret_masked, set_secret

logger = logging.getLogger(__name__)
router = APIRouter()


class ZoneAiConfigUpdate(BaseModel):
    is_enabled: bool | None = None
    devops_project: str | None = None
    devops_work_item_type: str | None = None
    devops_epic_id: int | None = None
    devops_feature_id: int | None = None
    anthropic_model: str | None = None
    max_cards_per_run: int | None = None


class ZoneAiSecretsUpdate(BaseModel):
    devops_org_url: str | None = None
    devops_pat_token: str | None = None
    anthropic_api_key: str | None = None


@router.get("/{zone_id}")
async def get_zone_ai_config(zone_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ZoneAiConfig).where(ZoneAiConfig.zone_id == zone_id))
    config = result.scalar_one_or_none()

    # Get masked secrets
    devops_org_url = await get_secret_masked(db, f"zone_{zone_id}_devops_org_url")
    devops_pat_token = await get_secret_masked(db, f"zone_{zone_id}_devops_pat_token")
    anthropic_api_key = await get_secret_masked(db, f"zone_{zone_id}_anthropic_api_key")

    if not config:
        return {
            "configured": False,
            "is_enabled": False,
            "devops_project": None,
            "devops_work_item_type": "Task",
            "devops_epic_id": None,
            "devops_feature_id": None,
            "anthropic_model": "claude-sonnet-4-20250514",
            "max_cards_per_run": 10,
            "secrets": {
                "devops_org_url": devops_org_url,
                "devops_pat_token": devops_pat_token,
                "anthropic_api_key": anthropic_api_key,
            },
        }

    return {
        "configured": True,
        "is_enabled": config.is_enabled,
        "devops_project": config.devops_project,
        "devops_work_item_type": config.devops_work_item_type,
        "devops_epic_id": config.devops_epic_id,
        "devops_feature_id": config.devops_feature_id,
        "anthropic_model": config.anthropic_model,
        "max_cards_per_run": config.max_cards_per_run,
        "secrets": {
            "devops_org_url": devops_org_url,
            "devops_pat_token": devops_pat_token,
            "anthropic_api_key": anthropic_api_key,
        },
    }


@router.put("/{zone_id}")
async def update_zone_ai_config(zone_id: str, body: ZoneAiConfigUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ZoneAiConfig).where(ZoneAiConfig.zone_id == zone_id))
    config = result.scalar_one_or_none()

    if not config:
        config = ZoneAiConfig(zone_id=zone_id)
        db.add(config)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(config, field, value)

    await db.commit()
    await db.refresh(config)
    return {"success": True, "message": "Configuration updated"}


@router.put("/{zone_id}/secrets")
async def update_zone_ai_secrets(zone_id: str, body: ZoneAiSecretsUpdate, db: AsyncSession = Depends(get_db)):
    saved = []
    if body.devops_org_url:
        await set_secret(db, f"zone_{zone_id}_devops_org_url", body.devops_org_url, f"DevOps Org URL for zone {zone_id}")
        saved.append("devops_org_url")
    if body.devops_pat_token:
        await set_secret(db, f"zone_{zone_id}_devops_pat_token", body.devops_pat_token, f"DevOps PAT for zone {zone_id}")
        saved.append("devops_pat_token")
    if body.anthropic_api_key:
        await set_secret(db, f"zone_{zone_id}_anthropic_api_key", body.anthropic_api_key, f"Anthropic API Key for zone {zone_id}")
        saved.append("anthropic_api_key")

    return {"success": True, "saved": saved}


@router.post("/{zone_id}/test-anthropic")
async def test_anthropic_connection(zone_id: str, db: AsyncSession = Depends(get_db)):
    api_key = await get_secret(db, f"zone_{zone_id}_anthropic_api_key")
    if not api_key:
        return {"success": False, "error": "Anthropic API Key not configured"}

    try:
        import httpx
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 10,
                    "messages": [{"role": "user", "content": "ping"}],
                },
            )
            if resp.status_code == 200:
                return {"success": True, "message": "Anthropic API connection successful"}
            return {"success": False, "error": f"Anthropic API returned {resp.status_code}", "details": resp.text[:300]}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/{zone_id}/test-devops")
async def test_devops_connection(zone_id: str, db: AsyncSession = Depends(get_db)):
    org_url = await get_secret(db, f"zone_{zone_id}_devops_org_url")
    pat = await get_secret(db, f"zone_{zone_id}_devops_pat_token")

    if not org_url or not pat:
        return {"success": False, "error": "DevOps credentials not configured"}

    # Get project name from config
    result = await db.execute(select(ZoneAiConfig).where(ZoneAiConfig.zone_id == zone_id))
    config = result.scalar_one_or_none()
    project = config.devops_project if config else None

    try:
        import httpx
        import base64
        auth = base64.b64encode(f":{pat}".encode()).decode()
        base = org_url.rstrip("/")

        async with httpx.AsyncClient(timeout=15) as client:
            # Test org access
            resp = await client.get(
                f"{base}/_apis/projects?api-version=7.1",
                headers={"Authorization": f"Basic {auth}"},
            )
            if resp.status_code != 200:
                return {"success": False, "error": f"DevOps returned {resp.status_code}", "details": resp.text[:300]}

            projects = [p["name"] for p in resp.json().get("value", [])]

            result_data = {
                "success": True,
                "message": "Azure DevOps connection successful",
                "projects": projects,
            }

            # Validate project if configured
            if project:
                if project in projects:
                    result_data["project_valid"] = True
                else:
                    result_data["project_valid"] = False
                    result_data["warning"] = f"Project '{project}' not found in organization"

            return result_data
    except Exception as e:
        return {"success": False, "error": str(e)}
