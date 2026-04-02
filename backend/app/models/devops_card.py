import uuid
from datetime import datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DevopsCard(Base):
    __tablename__ = "devops_cards"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    zone_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("zones.id"), nullable=False)
    managed_system_id: Mapped[int | None] = mapped_column(Integer)
    system_name: Mapped[str | None] = mapped_column(String)
    failure_ids: Mapped[list | None] = mapped_column(JSON)

    # DevOps fields
    devops_work_item_id: Mapped[int | None] = mapped_column(Integer)
    devops_url: Mapped[str | None] = mapped_column(String)
    title: Mapped[str | None] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(Text)
    assigned_to: Mapped[str | None] = mapped_column(String)
    owner1: Mapped[str | None] = mapped_column(String)
    owner2: Mapped[str | None] = mapped_column(String)
    due_date: Mapped[datetime | None] = mapped_column(Date)

    # AI classification
    ai_classification: Mapped[dict | None] = mapped_column(JSON)

    # Status: created, synced, closed, error
    status: Mapped[str] = mapped_column(String, default="created")
    error_message: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
