import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MaintenanceJob(Base):
    __tablename__ = "system_maintenance_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_type: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    requested_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), )
    output: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, default=dict)


class SyncProgress(Base):
    __tablename__ = "sync_progress"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sync_type: Mapped[str] = mapped_column(String, nullable=False, default="azure_vms")
    status: Mapped[str] = mapped_column(String, nullable=False, default="running")
    current_step: Mapped[str | None] = mapped_column(String)
    processed_count: Mapped[int] = mapped_column(Integer, default=0)
    total_count: Mapped[int] = mapped_column(Integer, default=0)
    vm_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("virtual_machines.id"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), )
    error_message: Mapped[str | None] = mapped_column(Text)


class SyncHistory(Base):
    __tablename__ = "sync_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trigger_type: Mapped[str] = mapped_column(String, nullable=False)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("zones.id"))
    schedule_type: Mapped[str | None] = mapped_column(String)
    zones_processed: Mapped[int] = mapped_column(Integer, default=0)
    results: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String, nullable=False, default="running")
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
