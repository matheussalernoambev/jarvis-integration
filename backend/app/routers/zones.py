import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.onboarding import OnboardingRule, OnboardingSetting
from app.models.settings import ZoneAzureConfig, ZoneSchedule, ZoneSsoConfig
from app.models.zone import Zone

router = APIRouter()


class ZoneCreate(BaseModel):
    code: str
    name: str
    description: str | None = None


class ZoneUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class AzureConfigUpdate(BaseModel):
    subscription_ids: list | None = None
    is_configured: bool | None = None


class OnboardingSettingsUpdate(BaseModel):
    workgroup: str | None = None
    functional_account: str | None = None
    account_names: str | None = None
    account_type_rule: str | None = None
    quickrule: str | None = None
    default_password: str | None = None
    automanage_system: bool | None = None
    automanage_accounts: bool | None = None
    change_frequency_type: str | None = None
    change_frequency_days: int | None = None
    change_time: str | None = None
    max_concurrent_requests: int | None = None
    system_description_template: str | None = None
    account_description_template: str | None = None


class OnboardingRuleCreate(BaseModel):
    name: str
    os_group: str
    domain_type: str = "any"
    managed_system_platform_id: int
    managed_system_platform_name: str | None = None
    functional_account_id: str
    functional_account_name: str | None = None
    functional_account_platform_id: int | None = None
    account_names: list[str] = []
    quick_rule_id: str | None = None
    quick_rule_name: str | None = None
    password_policy_id: int | None = None
    password_policy_name: str | None = None
    workgroup_id: str | None = None
    workgroup_name: str | None = None
    is_default: bool = False


class ScheduleUpdate(BaseModel):
    is_enabled: bool | None = None
    frequency_type: str | None = None
    frequency_value: int | None = None
    execution_time: str | None = None
    cron_expression: str | None = None
    batch_size: int | None = None


# ─── Zones CRUD ──────────────────────────────────────────────────────────────

@router.get("")
async def list_zones(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Zone).order_by(Zone.name))
    zones = result.scalars().all()
    return [_zone_to_dict(z) for z in zones]


@router.post("")
async def create_zone(body: ZoneCreate, db: AsyncSession = Depends(get_db)):
    zone = Zone(code=body.code, name=body.name, description=body.description)
    db.add(zone)
    await db.commit()
    await db.refresh(zone)
    return _zone_to_dict(zone)


@router.get("/{zone_id}")
async def get_zone(zone_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Zone).where(Zone.id == zone_id))
    zone = result.scalar_one_or_none()
    if not zone:
        return {"error": "Zone not found"}
    return _zone_to_dict(zone)


@router.put("/{zone_id}")
async def update_zone(zone_id: str, body: ZoneUpdate, db: AsyncSession = Depends(get_db)):
    values = {k: v for k, v in body.model_dump().items() if v is not None}
    if not values:
        return {"error": "No fields to update"}
    values["updated_at"] = datetime.now(timezone.utc)
    await db.execute(update(Zone).where(Zone.id == zone_id).values(**values))
    await db.commit()
    result = await db.execute(select(Zone).where(Zone.id == zone_id))
    zone = result.scalar_one_or_none()
    return _zone_to_dict(zone) if zone else {"error": "Zone not found"}


# ─── Zone Azure Config ──────────────────────────────────────────────────────

@router.get("/{zone_id}/azure-config")
async def get_azure_config(zone_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ZoneAzureConfig).where(ZoneAzureConfig.zone_id == zone_id))
    cfg = result.scalar_one_or_none()
    if not cfg:
        return {"zone_id": zone_id, "subscription_ids": None, "is_configured": False}
    return {
        "id": str(cfg.id), "zone_id": str(cfg.zone_id),
        "subscription_ids": cfg.subscription_ids,
        "is_configured": cfg.is_configured,
        "last_sync_at": cfg.last_sync_at.isoformat() if cfg.last_sync_at else None,
        "last_onboarding_at": cfg.last_onboarding_at.isoformat() if cfg.last_onboarding_at else None,
    }


@router.put("/{zone_id}/azure-config")
async def update_azure_config(zone_id: str, body: AzureConfigUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ZoneAzureConfig).where(ZoneAzureConfig.zone_id == zone_id))
    existing = result.scalar_one_or_none()

    values = {k: v for k, v in body.model_dump().items() if v is not None}
    values["updated_at"] = datetime.now(timezone.utc)

    if existing:
        await db.execute(update(ZoneAzureConfig).where(ZoneAzureConfig.zone_id == zone_id).values(**values))
    else:
        db.add(ZoneAzureConfig(zone_id=zone_id, **values))
    await db.commit()
    return {"success": True}


# ─── Onboarding Settings ────────────────────────────────────────────────────

@router.get("/{zone_id}/onboarding-settings")
async def get_onboarding_settings(zone_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(OnboardingSetting).where(OnboardingSetting.zone_id == zone_id))
    s = result.scalar_one_or_none()
    if not s:
        return {"zone_id": zone_id, "configured": False}
    return {
        "id": str(s.id), "zone_id": str(s.zone_id) if s.zone_id else None,
        "workgroup": s.workgroup, "functional_account": s.functional_account,
        "account_names": s.account_names, "account_type_rule": s.account_type_rule,
        "quickrule": s.quickrule, "default_password": s.default_password,
        "automanage_system": s.automanage_system, "automanage_accounts": s.automanage_accounts,
        "change_frequency_type": s.change_frequency_type,
        "change_frequency_days": s.change_frequency_days,
        "change_time": s.change_time, "max_concurrent_requests": s.max_concurrent_requests,
        "system_description_template": s.system_description_template,
        "account_description_template": s.account_description_template,
        "configured": True,
    }


@router.put("/{zone_id}/onboarding-settings")
async def update_onboarding_settings(zone_id: str, body: OnboardingSettingsUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(OnboardingSetting).where(OnboardingSetting.zone_id == zone_id))
    existing = result.scalar_one_or_none()

    values = {k: v for k, v in body.model_dump().items() if v is not None}
    values["updated_at"] = datetime.now(timezone.utc)

    if existing:
        await db.execute(update(OnboardingSetting).where(OnboardingSetting.zone_id == zone_id).values(**values))
    else:
        db.add(OnboardingSetting(zone_id=zone_id, **values))
    await db.commit()
    return {"success": True}


# ─── Onboarding Rules ───────────────────────────────────────────────────────

@router.get("/{zone_id}/onboarding-rules")
async def get_onboarding_rules(zone_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(OnboardingRule).where(OnboardingRule.zone_id == zone_id).order_by(OnboardingRule.name)
    )
    rules = result.scalars().all()
    return [
        {
            "id": str(r.id), "zone_id": str(r.zone_id), "name": r.name,
            "os_group": r.os_group, "domain_type": r.domain_type,
            "managed_system_platform_id": r.managed_system_platform_id,
            "managed_system_platform_name": r.managed_system_platform_name,
            "functional_account_id": r.functional_account_id,
            "functional_account_name": r.functional_account_name,
            "functional_account_platform_id": r.functional_account_platform_id,
            "account_names": r.account_names,
            "quick_rule_id": r.quick_rule_id, "quick_rule_name": r.quick_rule_name,
            "password_policy_id": r.password_policy_id, "password_policy_name": r.password_policy_name,
            "workgroup_id": r.workgroup_id, "workgroup_name": r.workgroup_name,
            "is_default": r.is_default,
        }
        for r in rules
    ]


@router.post("/{zone_id}/onboarding-rules")
async def create_onboarding_rule(zone_id: str, body: OnboardingRuleCreate, db: AsyncSession = Depends(get_db)):
    rule = OnboardingRule(zone_id=zone_id, **body.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return {"id": str(rule.id), "success": True}


@router.put("/{zone_id}/onboarding-rules/{rule_id}")
async def update_onboarding_rule(zone_id: str, rule_id: str, body: OnboardingRuleCreate, db: AsyncSession = Depends(get_db)):
    values = {k: v for k, v in body.model_dump().items()}
    values["updated_at"] = datetime.now(timezone.utc)
    await db.execute(
        update(OnboardingRule)
        .where(OnboardingRule.id == rule_id, OnboardingRule.zone_id == zone_id)
        .values(**values)
    )
    await db.commit()
    return {"id": rule_id, "success": True}


@router.delete("/{zone_id}/onboarding-rules/{rule_id}")
async def delete_onboarding_rule(zone_id: str, rule_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(
        delete(OnboardingRule).where(OnboardingRule.id == rule_id, OnboardingRule.zone_id == zone_id)
    )
    await db.commit()
    return {"success": True}


# ─── Schedules ───────────────────────────────────────────────────────────────

@router.get("/{zone_id}/schedules")
async def get_schedules(zone_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ZoneSchedule).where(ZoneSchedule.zone_id == zone_id))
    schedules = result.scalars().all()
    return [
        {
            "id": str(s.id), "zone_id": str(s.zone_id),
            "schedule_type": s.schedule_type, "is_enabled": s.is_enabled,
            "frequency_type": s.frequency_type, "frequency_value": s.frequency_value,
            "execution_time": s.execution_time, "cron_expression": s.cron_expression,
            "batch_size": s.batch_size, "last_status": s.last_status,
            "last_error": s.last_error,
            "last_execution_at": s.last_execution_at.isoformat() if s.last_execution_at else None,
            "next_execution_at": s.next_execution_at.isoformat() if s.next_execution_at else None,
        }
        for s in schedules
    ]


@router.put("/{zone_id}/schedules/{schedule_type}")
async def update_schedule(zone_id: str, schedule_type: str, body: ScheduleUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ZoneSchedule).where(ZoneSchedule.zone_id == zone_id, ZoneSchedule.schedule_type == schedule_type)
    )
    existing = result.scalar_one_or_none()

    values = {k: v for k, v in body.model_dump().items() if v is not None}
    values["updated_at"] = datetime.now(timezone.utc)

    if existing:
        await db.execute(
            update(ZoneSchedule)
            .where(ZoneSchedule.zone_id == zone_id, ZoneSchedule.schedule_type == schedule_type)
            .values(**values)
        )
    else:
        db.add(ZoneSchedule(zone_id=zone_id, schedule_type=schedule_type, **values))
    await db.commit()
    return {"success": True}


# ─── SSO Config ──────────────────────────────────────────────────────────────

@router.get("/{zone_id}/sso-config")
async def get_sso_config(zone_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ZoneSsoConfig).where(ZoneSsoConfig.zone_id == zone_id))
    cfg = result.scalar_one_or_none()
    if not cfg:
        return {"zone_id": zone_id, "configured": False}
    return {
        "id": str(cfg.id), "zone_id": str(cfg.zone_id),
        "admin_group_id": cfg.admin_group_id,
        "operator_group_id": cfg.operator_group_id,
        "viewer_group_id": cfg.viewer_group_id,
    }


@router.put("/{zone_id}/sso-config")
async def update_sso_config(zone_id: str, body: dict, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ZoneSsoConfig).where(ZoneSsoConfig.zone_id == zone_id))
    existing = result.scalar_one_or_none()

    values = {k: v for k, v in body.items() if k in ("admin_group_id", "operator_group_id", "viewer_group_id")}
    values["updated_at"] = datetime.now(timezone.utc)

    if existing:
        await db.execute(update(ZoneSsoConfig).where(ZoneSsoConfig.zone_id == zone_id).values(**values))
    else:
        db.add(ZoneSsoConfig(zone_id=zone_id, **values))
    await db.commit()
    return {"success": True}


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _zone_to_dict(z: Zone) -> dict:
    return {
        "id": str(z.id),
        "code": z.code,
        "name": z.name,
        "description": z.description,
        "is_active": z.is_active,
        "created_at": z.created_at.isoformat() if z.created_at else None,
        "updated_at": z.updated_at.isoformat() if z.updated_at else None,
    }
