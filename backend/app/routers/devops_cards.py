import asyncio
import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, async_session
from app.models.devops_card import DevopsCard
from app.models.credential_failure_analysis import CredentialFailureAnalysis
from app.models.zone_ai_config import ZoneAiConfig

logger = logging.getLogger(__name__)
router = APIRouter()


def _to_dict(card: DevopsCard) -> dict:
    return {
        "id": str(card.id),
        "zone_id": str(card.zone_id),
        "managed_system_id": card.managed_system_id,
        "system_name": card.system_name,
        "failure_ids": card.failure_ids,
        "devops_work_item_id": card.devops_work_item_id,
        "devops_url": card.devops_url,
        "title": card.title,
        "description": card.description,
        "assigned_to": card.assigned_to,
        "owner1": card.owner1,
        "owner2": card.owner2,
        "due_date": card.due_date.isoformat() if card.due_date else None,
        "ai_classification": card.ai_classification,
        "status": card.status,
        "error_message": card.error_message,
        "created_at": card.created_at.isoformat() if card.created_at else None,
    }


@router.get("")
async def list_devops_cards(
    zone_id: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(50, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    query = select(DevopsCard)
    if zone_id:
        query = query.where(DevopsCard.zone_id == zone_id)
    if status:
        query = query.where(DevopsCard.status == status)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(DevopsCard.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)

    return {
        "data": [_to_dict(c) for c in result.scalars().all()],
        "total": total,
    }


@router.get("/stats")
async def devops_cards_stats(zone_id: str | None = None, db: AsyncSession = Depends(get_db)):
    base = select(DevopsCard)
    if zone_id:
        base = base.where(DevopsCard.zone_id == zone_id)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0

    by_status_q = select(DevopsCard.status, func.count().label("cnt"))
    if zone_id:
        by_status_q = by_status_q.where(DevopsCard.zone_id == zone_id)
    by_status_q = by_status_q.group_by(DevopsCard.status)
    by_status = {row.status: row.cnt for row in (await db.execute(by_status_q)).all()}

    return {
        "total": total,
        "by_status": by_status,
    }


@router.post("/{card_id}/retry")
async def retry_devops_card(card_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DevopsCard).where(DevopsCard.id == card_id))
    card = result.scalar_one_or_none()
    if not card:
        return {"error": "Card not found"}
    if card.status != "error":
        return {"error": "Only cards with status 'error' can be retried"}

    card.status = "pending_retry"
    card.error_message = None
    await db.commit()
    return {"success": True, "message": "Card queued for retry"}


# ─── Analysis trigger ──────────────────────────────────────────────────────

async def _run_analysis_background(zone_id: str, dry_run: bool):
    """Background task: runs zone analysis with its own DB session."""
    from app.services.card_orchestrator import run_zone_analysis

    logger.info(f"[analyze-bg] Starting background analysis for zone {zone_id} (dry_run={dry_run})")
    start = time.time()

    async with async_session() as db:
        try:
            result = await run_zone_analysis(db, zone_id, dry_run=dry_run)
            elapsed = round(time.time() - start, 1)
            logger.info(
                f"[analyze-bg] Zone {zone_id} completed: "
                f"{result.systems_processed} systems, {result.cards_created} cards, "
                f"{len(result.errors)} errors, {elapsed}s"
            )
        except Exception as e:
            elapsed = round(time.time() - start, 1)
            logger.error(f"[analyze-bg] Zone {zone_id} failed after {elapsed}s: {e}")


@router.post("/analyze/{zone_id}")
async def analyze_zone(
    zone_id: str,
    dry_run: bool = Query(False),
    background_tasks: BackgroundTasks = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger AI analysis for a zone. Runs in background and returns immediately.
    Use dry_run=true to analyze without creating DevOps cards.
    """
    # Validate zone config before dispatching
    config_r = await db.execute(select(ZoneAiConfig).where(ZoneAiConfig.zone_id == zone_id))
    config = config_r.scalar_one_or_none()

    if not config or not config.is_enabled:
        return {"success": False, "error": "Zone AI analysis is not enabled"}

    # Dispatch to background
    asyncio.ensure_future(_run_analysis_background(zone_id, dry_run))

    return {
        "success": True,
        "message": f"Analysis started in background for zone {zone_id}",
        "dry_run": dry_run,
    }


# ─── AI Analysis listing and feedback ──────────────────────────────────────

def _analysis_to_dict(a: CredentialFailureAnalysis) -> dict:
    return {
        "id": str(a.id),
        "password_failure_id": str(a.password_failure_id),
        "zone_id": str(a.zone_id),
        "managed_account_id": a.managed_account_id,
        "error_raw": a.error_raw,
        "ai_diagnosis": a.ai_diagnosis,
        "ai_category": a.ai_category,
        "ai_confidence": a.ai_confidence,
        "suggested_action": a.suggested_action,
        "suggested_platform_type": a.suggested_platform_type,
        "card_title": a.card_title,
        "card_description": a.card_description,
        "feedback_correct": a.feedback_correct,
        "feedback_note": a.feedback_note,
        "analyzed_at": a.analyzed_at.isoformat() if a.analyzed_at else None,
    }


@router.get("/analyses")
async def list_analyses(
    zone_id: str | None = Query(None),
    limit: int = Query(50, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    query = select(CredentialFailureAnalysis)
    if zone_id:
        query = query.where(CredentialFailureAnalysis.zone_id == zone_id)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(CredentialFailureAnalysis.analyzed_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)

    return {
        "data": [_analysis_to_dict(a) for a in result.scalars().all()],
        "total": total,
    }


class FeedbackBody(BaseModel):
    correct: bool
    note: str | None = None


@router.post("/analyses/{analysis_id}/feedback")
async def submit_feedback(analysis_id: str, body: FeedbackBody, db: AsyncSession = Depends(get_db)):
    from app.services.few_shot_service import create_few_shot_from_analysis
    from app.services.audit_service import log_action

    result = await db.execute(select(CredentialFailureAnalysis).where(CredentialFailureAnalysis.id == analysis_id))
    analysis = result.scalar_one_or_none()
    if not analysis:
        return {"error": "Analysis not found"}

    analysis.feedback_correct = body.correct
    analysis.feedback_note = body.note

    few_shot_created = False
    if body.correct:
        few_shot_created = await create_few_shot_from_analysis(db, analysis_id)

    await log_action(
        db,
        action="feedback_submitted",
        resource_type="analysis",
        resource_id=analysis_id,
        zone_id=str(analysis.zone_id),
        details={"correct": body.correct, "note": body.note, "few_shot_created": few_shot_created},
    )

    await db.commit()
    return {"success": True, "few_shot_created": few_shot_created}


@router.get("/analyses/stats")
async def analyses_stats(zone_id: str | None = None, db: AsyncSession = Depends(get_db)):
    base = select(CredentialFailureAnalysis)
    if zone_id:
        base = base.where(CredentialFailureAnalysis.zone_id == zone_id)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0

    by_category_q = select(CredentialFailureAnalysis.ai_category, func.count().label("cnt"))
    if zone_id:
        by_category_q = by_category_q.where(CredentialFailureAnalysis.zone_id == zone_id)
    by_category_q = by_category_q.group_by(CredentialFailureAnalysis.ai_category)
    by_category = {row.ai_category or "unknown": row.cnt for row in (await db.execute(by_category_q)).all()}

    # Feedback accuracy
    feedback_q = select(
        func.count().filter(CredentialFailureAnalysis.feedback_correct.is_(True)).label("correct"),
        func.count().filter(CredentialFailureAnalysis.feedback_correct.is_(False)).label("incorrect"),
        func.count().filter(CredentialFailureAnalysis.feedback_correct.isnot(None)).label("total_feedback"),
    )
    if zone_id:
        feedback_q = feedback_q.where(CredentialFailureAnalysis.zone_id == zone_id)
    feedback = (await db.execute(feedback_q)).one()

    return {
        "total_analyses": total,
        "by_category": by_category,
        "feedback": {
            "correct": feedback.correct,
            "incorrect": feedback.incorrect,
            "total": feedback.total_feedback,
            "accuracy": round(feedback.correct / feedback.total_feedback * 100, 1) if feedback.total_feedback > 0 else None,
        },
    }


# ─── Few-shot & Audit endpoints ───────────────────────────────────────────

@router.get("/few-shot-stats")
async def few_shot_stats(zone_id: str | None = None, db: AsyncSession = Depends(get_db)):
    from app.services.few_shot_service import get_few_shot_stats
    return await get_few_shot_stats(db, zone_id)


@router.get("/audit-log")
async def list_audit_log(
    zone_id: str | None = Query(None),
    action: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    from app.models.audit_log import AuditLog

    query = select(AuditLog)
    if zone_id:
        query = query.where(AuditLog.zone_id == zone_id)
    if action:
        query = query.where(AuditLog.action == action)
    query = query.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)

    result = await db.execute(query)
    return [
        {
            "id": str(a.id),
            "zone_id": str(a.zone_id) if a.zone_id else None,
            "action": a.action,
            "resource_type": a.resource_type,
            "resource_id": a.resource_id,
            "details": a.details,
            "changed_by": a.changed_by,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in result.scalars().all()
    ]


# ─── Card status sync — polls Azure DevOps for state changes ─────────────

@router.post("/sync-status")
async def sync_card_status(db: AsyncSession = Depends(get_db)):
    """
    Sync open DevOps cards with Azure DevOps to update their status.
    Maps DevOps states (New, Active, Resolved, Closed, Removed) to card status.
    """
    from app.services.devops_service import get_work_item_state
    from app.services.credentials_service import get_secret

    start = time.time()
    logger.info("[sync-status] Starting card status sync...")

    # Get open cards that have a DevOps work item
    open_cards_q = select(DevopsCard).where(
        DevopsCard.devops_work_item_id.isnot(None),
        DevopsCard.status.in_(["created", "synced", "pending_retry"]),
    )
    cards = (await db.execute(open_cards_q)).scalars().all()

    if not cards:
        return {"message": "No open cards to sync", "synced": 0}

    # Group by zone to reuse credentials
    zone_creds: dict[str, tuple[str, str]] = {}
    updated = 0
    errors = 0

    devops_state_map = {
        "New": "created",
        "Active": "synced",
        "Resolved": "closed",
        "Closed": "closed",
        "Removed": "closed",
    }

    for card in cards:
        zone_id = str(card.zone_id)
        if zone_id not in zone_creds:
            org_url = await get_secret(db, f"zone_{zone_id}_devops_org_url")
            pat = await get_secret(db, f"zone_{zone_id}_devops_pat_token")
            if org_url and pat:
                zone_creds[zone_id] = (org_url, pat)
            else:
                zone_creds[zone_id] = (None, None)

        creds = zone_creds[zone_id]
        if not creds[0] or not creds[1]:
            continue

        try:
            state = await get_work_item_state(creds[0], creds[1], card.devops_work_item_id)
            if not state:
                continue

            new_status = devops_state_map.get(state["state"], card.status)
            if new_status != card.status:
                old_status = card.status
                card.status = new_status
                if state.get("assigned_to"):
                    card.assigned_to = state["assigned_to"]
                updated += 1
                logger.info(f"[sync-status] Card #{card.devops_work_item_id}: {old_status} → {new_status}")
        except Exception as e:
            errors += 1
            logger.warning(f"[sync-status] Error syncing card #{card.devops_work_item_id}: {e}")

    await db.commit()
    elapsed = round(time.time() - start, 1)
    logger.info(f"[sync-status] Done: {len(cards)} checked, {updated} updated, {errors} errors, {elapsed}s")

    return {
        "total_checked": len(cards),
        "updated": updated,
        "errors": errors,
        "elapsed_seconds": elapsed,
    }


# ─── Cron endpoint — called by K8s CronJob ───────────────────────────────

@router.post("/analyze-cron")
async def analyze_cron(db: AsyncSession = Depends(get_db)):
    """
    Periodic job: iterate all zones with AI analysis enabled and run analysis.
    Called by Kubernetes CronJob every N minutes.
    """
    from app.services.card_orchestrator import run_zone_analysis

    start = time.time()
    logger.info("[analyze-cron] Starting scheduled credential analysis...")

    # Get all enabled zones
    configs_q = select(ZoneAiConfig).where(ZoneAiConfig.is_enabled.is_(True))
    configs = (await db.execute(configs_q)).scalars().all()

    if not configs:
        logger.info("[analyze-cron] No zones with AI analysis enabled")
        return {"message": "No zones enabled", "zones_processed": 0}

    logger.info(f"[analyze-cron] Found {len(configs)} enabled zone(s)")
    results = []

    for config in configs:
        zone_id = str(config.zone_id)
        zone_start = time.time()
        logger.info(f"[analyze-cron] Processing zone {zone_id}")

        try:
            result = await run_zone_analysis(db, zone_id, dry_run=False)
            zone_elapsed = round(time.time() - zone_start, 1)

            zone_summary = {
                "zone_id": zone_id,
                "systems_processed": result.systems_processed,
                "cards_created": result.cards_created,
                "errors": result.errors,
                "elapsed_seconds": zone_elapsed,
            }
            results.append(zone_summary)

            logger.info(
                f"[analyze-cron] Zone {zone_id}: "
                f"{result.systems_processed} systems, "
                f"{result.cards_created} cards, "
                f"{len(result.errors)} errors, "
                f"{zone_elapsed}s"
            )
        except Exception as e:
            logger.error(f"[analyze-cron] Error processing zone {zone_id}: {e}")
            results.append({"zone_id": zone_id, "error": str(e)})

    elapsed = round(time.time() - start, 1)
    total_cards = sum(r.get("cards_created", 0) for r in results)
    logger.info(f"[analyze-cron] Completed: {len(results)} zones, {total_cards} cards, {elapsed}s total")

    return {
        "zones_processed": len(results),
        "total_cards_created": total_cards,
        "elapsed_seconds": elapsed,
        "results": results,
    }
