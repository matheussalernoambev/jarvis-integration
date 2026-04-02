"""Create tables for AI analysis and Azure DevOps integration

Revision ID: 003_ai_devops
Revises: 002_enrichment
Create Date: 2026-04-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON

revision = "003_ai_devops"
down_revision = "002_enrichment"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── zone_ai_configs ─────────────────────────────────────────────────
    op.create_table(
        "zone_ai_configs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("zone_id", UUID(as_uuid=True), sa.ForeignKey("zones.id"), unique=True, nullable=False),
        sa.Column("is_enabled", sa.Boolean, server_default=sa.text("false"), nullable=False),
        sa.Column("devops_project", sa.String, nullable=True),
        sa.Column("devops_work_item_type", sa.String, server_default="Task", nullable=False),
        sa.Column("devops_epic_id", sa.Integer, nullable=True),
        sa.Column("devops_feature_id", sa.Integer, nullable=True),
        sa.Column("anthropic_model", sa.String, server_default="claude-sonnet-4-20250514", nullable=False),
        sa.Column("max_cards_per_run", sa.Integer, server_default=sa.text("10"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # ── platform_owners ─────────────────────────────────────────────────
    op.create_table(
        "platform_owners",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("zone_id", UUID(as_uuid=True), sa.ForeignKey("zones.id"), nullable=False),
        sa.Column("platform_type", sa.String, nullable=False),
        sa.Column("owner1_email", sa.String, nullable=False),
        sa.Column("owner2_email", sa.String, server_default="matheus.salerno@ambevtech.com.br"),
        sa.Column("devops_area_path", sa.String, nullable=True),
        sa.Column("devops_iteration_path", sa.String, nullable=True),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_platform_owners_zone", "platform_owners", ["zone_id"])

    # ── devops_cards ────────────────────────────────────────────────────
    op.create_table(
        "devops_cards",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("zone_id", UUID(as_uuid=True), sa.ForeignKey("zones.id"), nullable=False),
        sa.Column("managed_system_id", sa.Integer, nullable=True),
        sa.Column("system_name", sa.String, nullable=True),
        sa.Column("failure_ids", JSON, nullable=True),
        sa.Column("devops_work_item_id", sa.Integer, nullable=True),
        sa.Column("devops_url", sa.String, nullable=True),
        sa.Column("title", sa.String, nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("assigned_to", sa.String, nullable=True),
        sa.Column("owner1", sa.String, nullable=True),
        sa.Column("owner2", sa.String, nullable=True),
        sa.Column("due_date", sa.Date, nullable=True),
        sa.Column("ai_classification", JSON, nullable=True),
        sa.Column("status", sa.String, server_default="created", nullable=False),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_devops_cards_zone", "devops_cards", ["zone_id"])
    op.create_index("ix_devops_cards_status", "devops_cards", ["status"])
    op.create_index("ix_devops_cards_system", "devops_cards", ["managed_system_id"])

    # ── credential_failure_analyses ─────────────────────────────────────
    op.create_table(
        "credential_failure_analyses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("password_failure_id", UUID(as_uuid=True), sa.ForeignKey("password_failures.id"), nullable=False),
        sa.Column("zone_id", UUID(as_uuid=True), sa.ForeignKey("zones.id"), nullable=False),
        sa.Column("managed_account_id", sa.Integer, nullable=True),
        sa.Column("error_raw", sa.Text, nullable=True),
        sa.Column("ai_diagnosis", sa.Text, nullable=True),
        sa.Column("ai_category", sa.String, nullable=True),
        sa.Column("ai_confidence", sa.Float, nullable=True),
        sa.Column("suggested_action", sa.Text, nullable=True),
        sa.Column("suggested_platform_type", sa.String, nullable=True),
        sa.Column("card_title", sa.String, nullable=True),
        sa.Column("card_description", sa.Text, nullable=True),
        sa.Column("feedback_correct", sa.Boolean, nullable=True),
        sa.Column("feedback_note", sa.Text, nullable=True),
        sa.Column("analyzed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_cfa_zone", "credential_failure_analyses", ["zone_id"])
    op.create_index("ix_cfa_password_failure", "credential_failure_analyses", ["password_failure_id"])
    op.create_index("ix_cfa_category", "credential_failure_analyses", ["ai_category"])

    # ── scheduled_reminders ─────────────────────────────────────────────
    op.create_table(
        "scheduled_reminders",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("zone_id", UUID(as_uuid=True), sa.ForeignKey("zones.id"), nullable=False),
        sa.Column("title", sa.String, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("assigned_to", sa.String, nullable=True),
        sa.Column("recurrence", sa.String, server_default="once", nullable=False),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("devops_work_item_id", sa.Integer, nullable=True),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_reminders_zone", "scheduled_reminders", ["zone_id"])
    op.create_index("ix_reminders_next_run", "scheduled_reminders", ["next_run_at"])


def downgrade() -> None:
    op.drop_table("scheduled_reminders")
    op.drop_table("credential_failure_analyses")
    op.drop_table("devops_cards")
    op.drop_table("platform_owners")
    op.drop_table("zone_ai_configs")
