import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.platform_owner import PlatformOwner

logger = logging.getLogger(__name__)
router = APIRouter()


class PlatformOwnerCreate(BaseModel):
    zone_id: str
    platform_type: str
    owner1_email: str
    owner2_email: str = "matheus.salerno@ambevtech.com.br"
    devops_area_path: str | None = None
    devops_iteration_path: str | None = None
    is_active: bool = True


class PlatformOwnerUpdate(BaseModel):
    platform_type: str | None = None
    owner1_email: str | None = None
    owner2_email: str | None = None
    devops_area_path: str | None = None
    devops_iteration_path: str | None = None
    is_active: bool | None = None


def _to_dict(po: PlatformOwner) -> dict:
    return {
        "id": str(po.id),
        "zone_id": str(po.zone_id),
        "platform_type": po.platform_type,
        "owner1_email": po.owner1_email,
        "owner2_email": po.owner2_email,
        "devops_area_path": po.devops_area_path,
        "devops_iteration_path": po.devops_iteration_path,
        "is_active": po.is_active,
        "created_at": po.created_at.isoformat() if po.created_at else None,
        "updated_at": po.updated_at.isoformat() if po.updated_at else None,
    }


@router.get("")
async def list_platform_owners(zone_id: str | None = None, db: AsyncSession = Depends(get_db)):
    query = select(PlatformOwner)
    if zone_id:
        query = query.where(PlatformOwner.zone_id == zone_id)
    query = query.order_by(PlatformOwner.platform_type)

    result = await db.execute(query)
    return [_to_dict(po) for po in result.scalars().all()]


@router.post("")
async def create_platform_owner(body: PlatformOwnerCreate, db: AsyncSession = Depends(get_db)):
    po = PlatformOwner(**body.model_dump())
    db.add(po)
    await db.commit()
    await db.refresh(po)
    return _to_dict(po)


@router.put("/{owner_id}")
async def update_platform_owner(owner_id: str, body: PlatformOwnerUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PlatformOwner).where(PlatformOwner.id == owner_id))
    po = result.scalar_one_or_none()
    if not po:
        return {"error": "Not found"}

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(po, field, value)

    await db.commit()
    await db.refresh(po)
    return _to_dict(po)


@router.delete("/{owner_id}")
async def delete_platform_owner(owner_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(PlatformOwner).where(PlatformOwner.id == owner_id))
    await db.commit()
    return {"success": True}
