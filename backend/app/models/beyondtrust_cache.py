import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Boolean, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BtPlatform(Base):
    __tablename__ = "bt_platforms_cache"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    platform_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    short_name: Mapped[str | None] = mapped_column(String)
    platform_type: Mapped[str | None] = mapped_column(String)
    port_number: Mapped[int | None] = mapped_column(Integer)
    description: Mapped[str | None] = mapped_column(Text)
    supports_password_management: Mapped[bool] = mapped_column(Boolean, default=False)
    supports_session_management: Mapped[bool] = mapped_column(Boolean, default=False)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class BtWorkgroup(Base):
    __tablename__ = "bt_workgroups_cache"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workgroup_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class BtFunctionalAccount(Base):
    __tablename__ = "bt_functional_accounts_cache"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    functional_account_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    account_name: Mapped[str] = mapped_column(String, nullable=False)
    domain_name: Mapped[str | None] = mapped_column(String)
    platform_id: Mapped[int | None] = mapped_column(Integer)
    description: Mapped[str | None] = mapped_column(Text)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class BtQuickRule(Base):
    __tablename__ = "bt_quick_rules_cache"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    quick_rule_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str | None] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(Text)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class BtPasswordPolicy(Base):
    __tablename__ = "bt_password_policies_cache"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    password_rule_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    minimum_length: Mapped[int | None] = mapped_column(Integer)
    maximum_length: Mapped[int | None] = mapped_column(Integer)
    require_uppercase: Mapped[bool] = mapped_column(Boolean, default=False)
    require_lowercase: Mapped[bool] = mapped_column(Boolean, default=False)
    require_numbers: Mapped[bool] = mapped_column(Boolean, default=False)
    require_special_chars: Mapped[bool] = mapped_column(Boolean, default=False)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class BtSyncStatus(Base):
    __tablename__ = "bt_sync_status"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resource_type: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), )
    items_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="pending")
    error_message: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
