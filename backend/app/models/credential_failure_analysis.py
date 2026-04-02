import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CredentialFailureAnalysis(Base):
    __tablename__ = "credential_failure_analyses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    password_failure_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("password_failures.id"), nullable=False)
    zone_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("zones.id"), nullable=False)
    managed_account_id: Mapped[int | None] = mapped_column(Integer)

    # Raw error from BeyondTrust Credentials/Change
    error_raw: Mapped[str | None] = mapped_column(Text)

    # AI analysis results
    ai_diagnosis: Mapped[str | None] = mapped_column(Text)
    ai_category: Mapped[str | None] = mapped_column(String)
    ai_confidence: Mapped[float | None] = mapped_column(Float)
    suggested_action: Mapped[str | None] = mapped_column(Text)
    suggested_platform_type: Mapped[str | None] = mapped_column(String)
    card_title: Mapped[str | None] = mapped_column(String)
    card_description: Mapped[str | None] = mapped_column(Text)

    # Feedback loop
    feedback_correct: Mapped[bool | None] = mapped_column(Boolean)
    feedback_note: Mapped[str | None] = mapped_column(Text)

    analyzed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
