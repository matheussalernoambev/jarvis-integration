import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OnboardingLog(Base):
    __tablename__ = "onboarding_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vm_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("virtual_machines.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class OnboardingSetting(Base):
    __tablename__ = "onboarding_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("zones.id", ondelete="CASCADE"))
    workgroup: Mapped[str] = mapped_column(String, nullable=False)
    functional_account: Mapped[str | None] = mapped_column(String)
    account_names: Mapped[str] = mapped_column(String, nullable=False, default="Administrator")
    account_type_rule: Mapped[str] = mapped_column(String, nullable=False, default="auto")
    quickrule: Mapped[str | None] = mapped_column(String)
    default_password: Mapped[str | None] = mapped_column(String)
    automanage_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    automanage_accounts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    change_frequency_type: Mapped[str] = mapped_column(String, nullable=False, default="xdays")
    change_frequency_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    change_time: Mapped[str] = mapped_column(String, nullable=False, default="23:30")
    max_concurrent_requests: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    system_description_template: Mapped[str] = mapped_column(String, nullable=False, default="Azure VM: {{vm_name}} | RG: {{resource_group}} | {{os_type}}")
    account_description_template: Mapped[str] = mapped_column(String, nullable=False, default="{{account_name}} on {{vm_name}}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class OnboardingRule(Base):
    __tablename__ = "onboarding_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    zone_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("zones.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    os_group: Mapped[str] = mapped_column(String, nullable=False)
    domain_type: Mapped[str] = mapped_column(String, nullable=False, default="any")
    managed_system_platform_id: Mapped[int] = mapped_column(Integer, nullable=False)
    managed_system_platform_name: Mapped[str | None] = mapped_column(String)
    functional_account_id: Mapped[str] = mapped_column(String, nullable=False)
    functional_account_name: Mapped[str | None] = mapped_column(String)
    functional_account_platform_id: Mapped[int | None] = mapped_column(Integer)
    account_names: Mapped[list] = mapped_column(ARRAY(String), nullable=False, default=list)
    quick_rule_id: Mapped[str | None] = mapped_column(String)
    quick_rule_name: Mapped[str | None] = mapped_column(String)
    password_policy_id: Mapped[int | None] = mapped_column(Integer)
    password_policy_name: Mapped[str | None] = mapped_column(String)
    workgroup_id: Mapped[str | None] = mapped_column(String)
    workgroup_name: Mapped[str | None] = mapped_column(String)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
