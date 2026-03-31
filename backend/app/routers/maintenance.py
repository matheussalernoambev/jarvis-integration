import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.maintenance import MaintenanceJob, SyncProgress

router = APIRouter()


class MaintenanceRequest(BaseModel):
    action: str  # list_jobs | request_job | cancel_job | get_agent_status
    job_type: str | None = None
    job_id: str | None = None


@router.post("")
async def maintenance_action(body: MaintenanceRequest, db: AsyncSession = Depends(get_db)):
    if body.action == "list_jobs":
        return await _list_jobs(db)
    elif body.action == "request_job":
        return await _request_job(db, body.job_type)
    elif body.action == "cancel_job":
        return await _cancel_job(db, body.job_id)
    elif body.action == "get_agent_status":
        return await _get_agent_status(db)
    return {"error": "Invalid action"}


@router.get("/jobs")
async def list_maintenance_jobs(db: AsyncSession = Depends(get_db)):
    return await _list_jobs(db)


async def _list_jobs(db: AsyncSession) -> dict:
    result = await db.execute(
        select(MaintenanceJob).order_by(MaintenanceJob.requested_at.desc()).limit(20)
    )
    jobs = result.scalars().all()
    return {
        "jobs": [
            {
                "id": str(j.id),
                "job_type": j.job_type,
                "status": j.status,
                "requested_by": str(j.requested_by),
                "requested_at": j.requested_at.isoformat() if j.requested_at else None,
                "started_at": j.started_at.isoformat() if j.started_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
                "output": j.output,
                "error": j.error,
                "metadata": j.metadata_,
            }
            for j in jobs
        ]
    }


async def _request_job(db: AsyncSession, job_type: str | None) -> dict:
    if not job_type:
        return {"error": "job_type required"}

    # Check for existing pending/running
    result = await db.execute(
        select(MaintenanceJob.id)
        .where(MaintenanceJob.job_type == job_type, MaintenanceJob.status.in_(["pending", "running"]))
        .limit(1)
    )
    if result.first():
        return {"error": "A job of this type is already pending or running"}

    # Mock user ID (no auth in this phase)
    job = MaintenanceJob(
        job_type=job_type,
        requested_by=uuid.UUID("00000000-0000-0000-0000-000000000000"),
        metadata_={"user_email": "admin@local"},
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return {
        "job": {
            "id": str(job.id),
            "job_type": job.job_type,
            "status": job.status,
            "requested_at": job.requested_at.isoformat() if job.requested_at else None,
        }
    }


async def _cancel_job(db: AsyncSession, job_id: str | None) -> dict:
    if not job_id:
        return {"error": "job_id required"}

    await db.execute(
        update(MaintenanceJob)
        .where(MaintenanceJob.id == job_id, MaintenanceJob.status == "pending")
        .values(status="cancelled", completed_at=datetime.now(timezone.utc))
    )
    await db.commit()

    result = await db.execute(select(MaintenanceJob).where(MaintenanceJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        return {"error": "Job not found"}
    return {
        "job": {
            "id": str(job.id),
            "job_type": job.job_type,
            "status": job.status,
        }
    }


@router.get("/sync-progress")
async def get_sync_progress(sync_type: str | None = None, db: AsyncSession = Depends(get_db)):
    query = select(SyncProgress).where(SyncProgress.status.in_(["running", "pending"]))
    if sync_type:
        query = query.where(SyncProgress.sync_type == sync_type)
    query = query.order_by(SyncProgress.updated_at.desc()).limit(10)
    result = await db.execute(query)
    rows = result.scalars().all()
    return [
        {
            "id": str(p.id),
            "sync_type": p.sync_type,
            "status": p.status,
            "current_step": p.current_step,
            "processed_count": p.processed_count,
            "total_count": p.total_count,
            "vm_id": str(p.vm_id) if p.vm_id else None,
            "started_at": p.started_at.isoformat() if p.started_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            "completed_at": p.completed_at.isoformat() if p.completed_at else None,
            "error_message": p.error_message,
        }
        for p in rows
    ]


async def _get_agent_status(db: AsyncSession) -> dict:
    five_min_ago = datetime.now(timezone.utc) - timedelta(minutes=5)
    ten_min_ago = datetime.now(timezone.utc) - timedelta(minutes=10)

    recent = await db.execute(
        select(MaintenanceJob.id).where(MaintenanceJob.completed_at >= five_min_ago).limit(1)
    )
    stale = await db.execute(
        select(MaintenanceJob.id)
        .where(MaintenanceJob.status == "running", MaintenanceJob.started_at < ten_min_ago)
        .limit(1)
    )

    is_active = recent.first() is not None
    has_stale = stale.first() is not None

    return {
        "agent_status": "online" if is_active else "unknown",
        "has_stale_jobs": has_stale,
        "message": "Agent processed jobs recently" if is_active else "No recent activity from agent",
    }
