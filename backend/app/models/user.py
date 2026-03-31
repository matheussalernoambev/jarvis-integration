import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserRole(Base):
    __tablename__ = "user_roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default="viewer")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class UserZoneRole(Base):
    __tablename__ = "user_zone_roles"
    __table_args__ = (UniqueConstraint("user_id", "zone_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(String, nullable=False)
    zone_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("zones.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
