"""
Audit Service — lightweight audit logging for key actions.
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


async def log_action(
    db: AsyncSession,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    zone_id: str | None = None,
    details: dict | None = None,
    changed_by: str | None = None,
) -> None:
    """
    Record an audit log entry.
    Non-blocking: errors are logged but don't propagate.
    """
    try:
        entry = AuditLog(
            zone_id=zone_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            changed_by=changed_by,
        )
        db.add(entry)
        await db.flush()
    except Exception as e:
        logger.warning(f"[Audit] Failed to log action '{action}': {e}")
