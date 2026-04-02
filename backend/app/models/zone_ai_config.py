import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ZoneAiConfig(Base):
    __tablename__ = "zone_ai_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    zone_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("zones.id"), unique=True, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    # DevOps config (secrets stored in Key Vault: zone_{zone_id}_devops_org_url, zone_{zone_id}_devops_pat_token)
    devops_project: Mapped[str | None] = mapped_column(String)
    devops_work_item_type: Mapped[str] = mapped_column(String, default="Task")
    devops_epic_id: Mapped[int | None] = mapped_column(Integer)
    devops_feature_id: Mapped[int | None] = mapped_column(Integer)

    # Anthropic config (secret stored in Key Vault: zone_{zone_id}_anthropic_api_key)
    anthropic_model: Mapped[str] = mapped_column(String, default="claude-sonnet-4-20250514")

    # Limits
    max_cards_per_run: Mapped[int] = mapped_column(Integer, default=10)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
