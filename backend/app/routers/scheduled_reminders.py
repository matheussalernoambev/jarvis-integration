import logging
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.scheduled_reminder import ScheduledReminder
from app.models.zone_ai_config import ZoneAiConfig

logger = logging.getLogger(__name__)
router = APIRouter()


class ReminderCreate(BaseModel):
    zone_id: str
    title: str
    description: str | None = None
    assigned_to: str | None = None
    recurrence: str = "once"
    next_run_at: str | None = None
    is_active: bool = True


class ReminderUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    assigned_to: str | None = None
    recurrence: str | None = None
    next_run_at: str | None = None
    is_active: bool | None = None


def _to_dict(r: ScheduledReminder) -> dict:
    return {
        "id": str(r.id),
        "zone_id": str(r.zone_id),
        "title": r.title,
        "description": r.description,
        "assigned_to": r.assigned_to,
        "recurrence": r.recurrence,
        "next_run_at": r.next_run_at.isoformat() if r.next_run_at else None,
        "devops_work_item_id": r.devops_work_item_id,
        "is_active": r.is_active,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


@router.get("")
async def list_reminders(zone_id: str | None = Query(None), db: AsyncSession = Depends(get_db)):
    query = select(ScheduledReminder)
    if zone_id:
        query = query.where(ScheduledReminder.zone_id == zone_id)
    query = query.order_by(ScheduledReminder.next_run_at)

    result = await db.execute(query)
    return [_to_dict(r) for r in result.scalars().all()]


@router.post("")
async def create_reminder(body: ReminderCreate, db: AsyncSession = Depends(get_db)):
    data = body.model_dump()
    if data.get("next_run_at"):
        from app.services.password_failures_service import parse_date
        data["next_run_at"] = parse_date(data["next_run_at"])

    reminder = ScheduledReminder(**data)
    db.add(reminder)
    await db.commit()
    await db.refresh(reminder)
    return _to_dict(reminder)


@router.put("/{reminder_id}")
async def update_reminder(reminder_id: str, body: ReminderUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ScheduledReminder).where(ScheduledReminder.id == reminder_id))
    reminder = result.scalar_one_or_none()
    if not reminder:
        return {"error": "Not found"}

    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "next_run_at" and value:
            from app.services.password_failures_service import parse_date
            value = parse_date(value)
        setattr(reminder, field, value)

    await db.commit()
    await db.refresh(reminder)
    return _to_dict(reminder)


@router.delete("/{reminder_id}")
async def delete_reminder(reminder_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(ScheduledReminder).where(ScheduledReminder.id == reminder_id))
    await db.commit()
    return {"success": True}


# ─── Cron endpoint — called by K8s CronJob ───────────────────────────────

def _advance_next_run(current: datetime, recurrence: str) -> datetime | None:
    """Calculate next run based on recurrence pattern. Returns None for 'once'."""
    if recurrence == "daily":
        return current + timedelta(days=1)
    elif recurrence == "weekly":
        return current + timedelta(weeks=1)
    elif recurrence == "monthly":
        # Advance by ~30 days, keeping same day-of-month when possible
        month = current.month + 1
        year = current.year
        if month > 12:
            month = 1
            year += 1
        try:
            return current.replace(year=year, month=month)
        except ValueError:
            # Handle months with fewer days (e.g., Jan 31 → Feb 28)
            import calendar
            last_day = calendar.monthrange(year, month)[1]
            return current.replace(year=year, month=month, day=min(current.day, last_day))
    return None  # "once" — deactivate after execution


@router.post("/process-cron")
async def process_reminders_cron(db: AsyncSession = Depends(get_db)):
    """
    Periodic job: process due reminders — create/update DevOps work items.
    Called by Kubernetes CronJob.
    """
    from app.services.credentials_service import get_secret
    from app.services.devops_service import create_work_item

    start = time.time()
    now = datetime.now(timezone.utc)
    logger.info("[reminder-cron] Starting scheduled reminder processing...")

    # Fetch due reminders
    due_q = (
        select(ScheduledReminder)
        .where(
            ScheduledReminder.is_active.is_(True),
            ScheduledReminder.next_run_at.isnot(None),
            ScheduledReminder.next_run_at <= now,
        )
        .order_by(ScheduledReminder.next_run_at)
        .limit(50)
    )
    reminders = (await db.execute(due_q)).scalars().all()

    if not reminders:
        logger.info("[reminder-cron] No due reminders")
        return {"message": "No due reminders", "processed": 0}

    logger.info(f"[reminder-cron] Found {len(reminders)} due reminder(s)")

    # Cache zone DevOps configs to avoid repeated queries
    zone_configs: dict = {}
    results = []

    for reminder in reminders:
        zone_id = str(reminder.zone_id)

        try:
            # Load zone DevOps config (cached)
            if zone_id not in zone_configs:
                config_r = await db.execute(select(ZoneAiConfig).where(ZoneAiConfig.zone_id == zone_id))
                config = config_r.scalar_one_or_none()

                if config and config.devops_project:
                    org_url = await get_secret(db, f"zone_{zone_id}_devops_org_url")
                    pat = await get_secret(db, f"zone_{zone_id}_devops_pat_token")
                    zone_configs[zone_id] = {
                        "org_url": org_url,
                        "pat": pat,
                        "project": config.devops_project,
                        "feature_id": config.devops_feature_id,
                        "epic_id": config.devops_epic_id,
                    }
                else:
                    zone_configs[zone_id] = None

            zc = zone_configs[zone_id]

            if not zc or not zc["org_url"] or not zc["pat"]:
                logger.warning(f"[reminder-cron] Zone {zone_id} has no DevOps config — skipping reminder '{reminder.title}'")
                results.append({"id": str(reminder.id), "title": reminder.title, "skipped": "no DevOps config"})
                # Still advance schedule so it doesn't block
                next_run = _advance_next_run(reminder.next_run_at, reminder.recurrence)
                if next_run:
                    reminder.next_run_at = next_run
                else:
                    reminder.is_active = False
                continue

            # Create or update DevOps work item
            if reminder.devops_work_item_id:
                # Already has a work item — skip creation (future: add comment)
                logger.info(f"[reminder-cron] Reminder '{reminder.title}' already has WI #{reminder.devops_work_item_id}")
                results.append({"id": str(reminder.id), "title": reminder.title, "existing_wi": reminder.devops_work_item_id})
            else:
                # Create new work item
                description = f"<h3>Lembrete Automático</h3><p>{reminder.description or reminder.title}</p>"
                parent_id = zc["feature_id"] or zc["epic_id"]

                devops_result = await create_work_item(
                    org_url=zc["org_url"],
                    pat_token=zc["pat"],
                    project=zc["project"],
                    work_item_type="Task",
                    title=f"[Reminder] {reminder.title}",
                    description=description,
                    assigned_to=reminder.assigned_to,
                    parent_id=parent_id,
                    tags="Jarvis Automation;Reminder",
                )

                if devops_result.success:
                    reminder.devops_work_item_id = devops_result.work_item.work_item_id
                    logger.info(f"[reminder-cron] Created WI #{devops_result.work_item.work_item_id} for '{reminder.title}'")
                    results.append({"id": str(reminder.id), "title": reminder.title, "wi_created": devops_result.work_item.work_item_id})
                else:
                    logger.error(f"[reminder-cron] Failed to create WI for '{reminder.title}': {devops_result.error}")
                    results.append({"id": str(reminder.id), "title": reminder.title, "error": devops_result.error})

            # Advance schedule
            next_run = _advance_next_run(reminder.next_run_at, reminder.recurrence)
            if next_run:
                reminder.next_run_at = next_run
            else:
                reminder.is_active = False

        except Exception as e:
            logger.error(f"[reminder-cron] Error processing reminder '{reminder.title}': {e}")
            results.append({"id": str(reminder.id), "title": reminder.title, "error": str(e)})

    await db.commit()

    elapsed = round(time.time() - start, 1)
    logger.info(f"[reminder-cron] Completed: {len(results)} reminders, {elapsed}s")

    return {
        "processed": len(results),
        "elapsed_seconds": elapsed,
        "results": results,
    }
