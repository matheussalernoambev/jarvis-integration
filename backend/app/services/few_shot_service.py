"""
Few-Shot Example Service — manages the feedback→few-shot pipeline.
Converts confirmed-correct analyses into few-shot examples for the Anthropic prompt.
"""

import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.credential_failure_analysis import CredentialFailureAnalysis
from app.models.few_shot_example import FewShotExample

logger = logging.getLogger(__name__)

MAX_EXAMPLES_PER_ZONE = 20  # Limit to prevent prompt bloat


async def create_few_shot_from_analysis(db: AsyncSession, analysis_id: str) -> bool:
    """
    Convert a confirmed-correct analysis into a few-shot example.
    Returns True if created, False if already exists or analysis not found.
    """
    # Check if already converted
    existing = await db.execute(
        select(FewShotExample).where(FewShotExample.analysis_id == analysis_id)
    )
    if existing.scalar_one_or_none():
        logger.info(f"[FewShot] Analysis {analysis_id} already has a few-shot example")
        return False

    # Load the analysis
    result = await db.execute(
        select(CredentialFailureAnalysis).where(CredentialFailureAnalysis.id == analysis_id)
    )
    analysis = result.scalar_one_or_none()
    if not analysis or not analysis.feedback_correct:
        return False

    # Build the user message (same format used in anthropic_service)
    user_message = f"""Analise este erro de rotação de credencial:

Hostname: (from analysis)
ManagedAccountID: {analysis.managed_account_id}

Erro capturado:
{analysis.error_raw}"""

    # Build the assistant response
    assistant_response = json.dumps({
        "category": analysis.ai_category,
        "diagnosis": analysis.ai_diagnosis,
        "suggested_action": analysis.suggested_action,
        "platform_type": analysis.suggested_platform_type,
        "confidence": analysis.ai_confidence,
        "card_title": analysis.card_title,
        "card_description": analysis.card_description,
    }, ensure_ascii=False)

    example = FewShotExample(
        zone_id=analysis.zone_id,
        analysis_id=analysis.id,
        user_message=user_message,
        assistant_response=assistant_response,
        ai_category=analysis.ai_category,
        ai_confidence=analysis.ai_confidence,
    )
    db.add(example)
    await db.flush()

    logger.info(f"[FewShot] Created example from analysis {analysis_id} (category={analysis.ai_category})")
    return True


async def load_zone_few_shot_examples(db: AsyncSession, zone_id: str) -> list[dict]:
    """
    Load zone-specific few-shot examples from the database.
    Returns list of {role, content} message pairs for the Anthropic API.
    """
    query = (
        select(FewShotExample)
        .where(FewShotExample.zone_id == zone_id)
        .order_by(FewShotExample.ai_confidence.desc())
        .limit(MAX_EXAMPLES_PER_ZONE)
    )
    result = await db.execute(query)
    examples = result.scalars().all()

    messages = []
    for ex in examples:
        messages.append({"role": "user", "content": ex.user_message})
        messages.append({"role": "assistant", "content": ex.assistant_response})

    if messages:
        logger.info(f"[FewShot] Loaded {len(examples)} zone-specific examples for zone {zone_id}")

    return messages


async def get_few_shot_stats(db: AsyncSession, zone_id: str | None = None) -> dict:
    """Get statistics about few-shot examples."""
    from sqlalchemy import func

    query = select(
        FewShotExample.ai_category,
        func.count().label("count"),
    )
    if zone_id:
        query = query.where(FewShotExample.zone_id == zone_id)
    query = query.group_by(FewShotExample.ai_category)

    result = await db.execute(query)
    by_category = {row.ai_category or "unknown": row.count for row in result.all()}

    total_q = select(func.count()).select_from(FewShotExample)
    if zone_id:
        total_q = total_q.where(FewShotExample.zone_id == zone_id)
    total = (await db.execute(total_q)).scalar() or 0

    return {"total": total, "by_category": by_category}
