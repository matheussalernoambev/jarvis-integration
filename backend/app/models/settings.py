import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AutomationConfig(Base):
    __tablename__ = "automation_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    config_key: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    config_value: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    azure_subscriptions: Mapped[list | None] = mapped_column(ARRAY(String))
    beyondtrust_default_group: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ZoneAzureConfig(Base):
    __tablename__ = "zone_azure_config"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    zone_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("zones.id", ondelete="CASCADE"), unique=True, nullable=False)
    subscription_ids: Mapped[dict | None] = mapped_column(JSON)
    is_configured: Mapped[bool] = mapped_column(Boolean, default=False)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), )
    last_onboarding_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ZoneSchedule(Base):
    __tablename__ = "zone_schedules"
    __table_args__ = (UniqueConstraint("zone_id", "schedule_type"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    zone_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("zones.id", ondelete="CASCADE"), nullable=False)
    schedule_type: Mapped[str] = mapped_column(String, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    frequency_type: Mapped[str] = mapped_column(String, nullable=False, default="daily")
    frequency_value: Mapped[int] = mapped_column(Integer, default=1)
    execution_time: Mapped[str] = mapped_column(String, default="02:00")
    cron_expression: Mapped[str | None] = mapped_column(String)
    batch_size: Mapped[int] = mapped_column(Integer, default=10)
    last_execution_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), )
    next_execution_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), )
    last_status: Mapped[str] = mapped_column(String, default="pending")
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ZoneSsoConfig(Base):
    __tablename__ = "zone_sso_config"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    zone_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("zones.id", ondelete="CASCADE"), unique=True, nullable=False)
    admin_group_id: Mapped[str | None] = mapped_column(String)
    operator_group_id: Mapped[str | None] = mapped_column(String)
    viewer_group_id: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
