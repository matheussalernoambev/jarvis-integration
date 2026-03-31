import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class VirtualMachine(Base):
    __tablename__ = "virtual_machines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String)
    subscription: Mapped[str] = mapped_column(String, nullable=False)
    subscription_name: Mapped[str | None] = mapped_column(String)
    resource_group: Mapped[str] = mapped_column(String, nullable=False)
    os_type: Mapped[str] = mapped_column(String, nullable=False)
    domain_status: Mapped[str] = mapped_column(String, nullable=False)
    domain_name: Mapped[str | None] = mapped_column(String)
    azure_vm_id: Mapped[str | None] = mapped_column(String, unique=True)
    location: Mapped[str | None] = mapped_column(String)
    vm_size: Mapped[str | None] = mapped_column(String)
    power_state: Mapped[str] = mapped_column(String, default="unknown")
    onboarding_status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    onboarding_type: Mapped[str | None] = mapped_column(String)
    onboarding_error: Mapped[str | None] = mapped_column(Text)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("zones.id"))
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
