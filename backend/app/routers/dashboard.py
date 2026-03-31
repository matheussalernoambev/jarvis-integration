from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.password_failure import PasswordFailure
from app.models.virtual_machine import VirtualMachine
from app.models.zone import Zone

router = APIRouter()


@router.get("/stats")
async def get_dashboard_stats(db: AsyncSession = Depends(get_db)):
    # Total VMs
    total_vms = (await db.execute(select(func.count(VirtualMachine.id)))).scalar() or 0

    # VMs by status
    status_q = await db.execute(
        select(VirtualMachine.onboarding_status, func.count(VirtualMachine.id))
        .group_by(VirtualMachine.onboarding_status)
    )
    by_status = {row[0]: row[1] for row in status_q.all()}

    # VMs by power state
    power_q = await db.execute(
        select(VirtualMachine.power_state, func.count(VirtualMachine.id))
        .group_by(VirtualMachine.power_state)
    )
    by_power = {row[0]: row[1] for row in power_q.all()}

    # VMs by OS
    os_q = await db.execute(
        select(VirtualMachine.os_type, func.count(VirtualMachine.id))
        .group_by(VirtualMachine.os_type)
    )
    by_os = {row[0]: row[1] for row in os_q.all()}

    # VMs by domain status
    domain_q = await db.execute(
        select(VirtualMachine.domain_status, func.count(VirtualMachine.id))
        .group_by(VirtualMachine.domain_status)
    )
    by_domain = {row[0]: row[1] for row in domain_q.all()}

    # Zones
    total_zones = (await db.execute(select(func.count(Zone.id)).where(Zone.is_active.is_(True)))).scalar() or 0

    # Password failures
    total_failures = (await db.execute(
        select(func.count(PasswordFailure.id)).where(PasswordFailure.record_type == "failure")
    )).scalar() or 0

    total_automanage_disabled = (await db.execute(
        select(func.count(PasswordFailure.id)).where(PasswordFailure.record_type == "automanage_disabled")
    )).scalar() or 0

    return {
        "total_vms": total_vms,
        "total_zones": total_zones,
        "total_password_failures": total_failures,
        "total_automanage_disabled": total_automanage_disabled,
        "vms_by_onboarding_status": by_status,
        "vms_by_power_state": by_power,
        "vms_by_os_type": by_os,
        "vms_by_domain_status": by_domain,
    }
