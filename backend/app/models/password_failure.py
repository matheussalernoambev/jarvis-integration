import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PasswordFailure(Base):
    __tablename__ = "password_failures"
    __table_args__ = (
        UniqueConstraint("account_name", "system_name", "record_type", "import_source", "workgroup_name", name="uq_pf_upsert_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    managed_account_id: Mapped[int | None] = mapped_column(Integer)
    managed_system_id: Mapped[int | None] = mapped_column(Integer)
    account_name: Mapped[str] = mapped_column(String, nullable=False)
    system_name: Mapped[str] = mapped_column(String, nullable=False, default="")
    domain_name: Mapped[str | None] = mapped_column(String)
    platform_name: Mapped[str | None] = mapped_column(String)
    workgroup_id: Mapped[int | None] = mapped_column(Integer)
    workgroup_name: Mapped[str] = mapped_column(String, nullable=False, default="")
    zone_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("zones.id"))
    failure_count: Mapped[int] = mapped_column(Integer, default=1)
    failure_reason: Mapped[str | None] = mapped_column(Text)
    last_change_attempt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), )
    last_change_result: Mapped[str | None] = mapped_column(String)
    first_failure_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    import_source: Mapped[str] = mapped_column(String, default="api")
    import_batch_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), )
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    record_type: Mapped[str] = mapped_column(String, nullable=False, default="failure")
    last_import_job_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))

    # Enrichment columns (from BT API ManagedAccounts + ManagedSystems)
    host_name: Mapped[str | None] = mapped_column(String)
    ip_address: Mapped[str | None] = mapped_column(String)
    dns_name: Mapped[str | None] = mapped_column(String)
    distinguished_name: Mapped[str | None] = mapped_column(String)
    sam_account_name: Mapped[str | None] = mapped_column(String)
    user_principal_name: Mapped[str | None] = mapped_column(String)
    change_state: Mapped[int | None] = mapped_column(Integer)
    change_state_description: Mapped[str | None] = mapped_column(String)
    auto_management_flag: Mapped[bool | None] = mapped_column(Boolean)
    password_rule_name: Mapped[str | None] = mapped_column(String)
    last_change_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_change_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    change_frequency_type: Mapped[str | None] = mapped_column(String)
    change_frequency_days: Mapped[int | None] = mapped_column(Integer)
    release_duration: Mapped[int | None] = mapped_column(Integer)
    max_release_duration: Mapped[int | None] = mapped_column(Integer)
    api_enabled: Mapped[bool | None] = mapped_column(Boolean)
    api_account_data: Mapped[dict | None] = mapped_column(JSON)


class PasswordFailureSnapshot(Base):
    __tablename__ = "password_failure_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    snapshot_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    zone_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("zones.id"))
    zone_code: Mapped[str | None] = mapped_column(String)
    total_failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    import_source: Mapped[str] = mapped_column(String, default="csv")
    record_type: Mapped[str] = mapped_column(String, nullable=False, default="failure")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ImportJob(Base):
    __tablename__ = "import_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    mode: Mapped[str] = mapped_column(String, nullable=False, default="diff")
    total_lines: Mapped[int] = mapped_column(Integer, default=0)
    processed_lines: Mapped[int] = mapped_column(Integer, default=0)
    stats: Mapped[dict | None] = mapped_column(JSON, default=dict)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), )
