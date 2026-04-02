"""Add few_shot_examples and audit_logs tables

Revision ID: 004_feedback
Revises: 003_ai_devops
Create Date: 2026-04-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON

revision = "004_feedback"
down_revision = "003_ai_devops"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "few_shot_examples",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("zone_id", UUID(as_uuid=True), sa.ForeignKey("zones.id"), nullable=False),
        sa.Column("analysis_id", UUID(as_uuid=True), sa.ForeignKey("credential_failure_analyses.id"), nullable=False, unique=True),
        sa.Column("user_message", sa.Text, nullable=False),
        sa.Column("assistant_response", sa.Text, nullable=False),
        sa.Column("ai_category", sa.String),
        sa.Column("ai_confidence", sa.Float),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_fse_zone_id", "few_shot_examples", ["zone_id"])
    op.create_index("ix_fse_category", "few_shot_examples", ["ai_category"])

    op.create_table(
        "audit_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("zone_id", UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String, nullable=False),
        sa.Column("resource_type", sa.String, nullable=False),
        sa.Column("resource_id", sa.String),
        sa.Column("details", JSON),
        sa.Column("changed_by", sa.String),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_audit_zone", "audit_logs", ["zone_id"])
    op.create_index("ix_audit_action", "audit_logs", ["action"])
    op.create_index("ix_audit_created", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("few_shot_examples")
