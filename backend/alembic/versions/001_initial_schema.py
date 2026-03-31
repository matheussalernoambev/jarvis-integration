"""Initial schema - clean migration without Supabase dependencies

Revision ID: 001_initial
Revises:
Create Date: 2026-03-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON, ARRAY

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ─── zones ───────────────────────────────────────────────────────
    op.create_table(
        "zones",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String, unique=True, nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ─── virtual_machines ────────────────────────────────────────────
    op.create_table(
        "virtual_machines",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("ip_address", sa.String),
        sa.Column("subscription", sa.String, nullable=False),
        sa.Column("subscription_name", sa.String),
        sa.Column("resource_group", sa.String, nullable=False),
        sa.Column("os_type", sa.String, nullable=False),
        sa.Column("domain_status", sa.String, nullable=False),
        sa.Column("domain_name", sa.String),
        sa.Column("azure_vm_id", sa.String, unique=True),
        sa.Column("location", sa.String),
        sa.Column("vm_size", sa.String),
        sa.Column("power_state", sa.String, server_default="unknown"),
        sa.Column("onboarding_status", sa.String, nullable=False, server_default="pending"),
        sa.Column("onboarding_type", sa.String),
        sa.Column("onboarding_error", sa.Text),
        sa.Column("zone_id", UUID(as_uuid=True), sa.ForeignKey("zones.id")),
        sa.Column("last_synced_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_vm_zone_id", "virtual_machines", ["zone_id"])
    op.create_index("ix_vm_onboarding_status", "virtual_machines", ["onboarding_status"])

    # ─── app_secrets (replaces vault.secrets) ────────────────────────
    op.create_table(
        "app_secrets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String, unique=True, nullable=False),
        sa.Column("secret", sa.Text, nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ─── automation_configs ──────────────────────────────────────────
    op.create_table(
        "automation_configs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("config_key", sa.String, unique=True, nullable=False),
        sa.Column("config_value", sa.Text, nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("azure_subscriptions", ARRAY(sa.String)),
        sa.Column("beyondtrust_default_group", sa.String),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ─── zone_azure_config ───────────────────────────────────────────
    op.create_table(
        "zone_azure_config",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("zone_id", UUID(as_uuid=True), sa.ForeignKey("zones.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("subscription_ids", JSON),
        sa.Column("is_configured", sa.Boolean, server_default="false"),
        sa.Column("last_sync_at", sa.DateTime(timezone=True)),
        sa.Column("last_onboarding_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ─── zone_schedules ──────────────────────────────────────────────
    op.create_table(
        "zone_schedules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("zone_id", UUID(as_uuid=True), sa.ForeignKey("zones.id", ondelete="CASCADE"), nullable=False),
        sa.Column("schedule_type", sa.String, nullable=False),
        sa.Column("is_enabled", sa.Boolean, server_default="false"),
        sa.Column("frequency_type", sa.String, nullable=False, server_default="daily"),
        sa.Column("frequency_value", sa.Integer, server_default="1"),
        sa.Column("execution_time", sa.String, server_default="02:00"),
        sa.Column("cron_expression", sa.String),
        sa.Column("batch_size", sa.Integer, server_default="10"),
        sa.Column("last_execution_at", sa.DateTime(timezone=True)),
        sa.Column("next_execution_at", sa.DateTime(timezone=True)),
        sa.Column("last_status", sa.String, server_default="pending"),
        sa.Column("last_error", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("zone_id", "schedule_type"),
    )

    # ─── zone_sso_config ─────────────────────────────────────────────
    op.create_table(
        "zone_sso_config",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("zone_id", UUID(as_uuid=True), sa.ForeignKey("zones.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("admin_group_id", sa.String),
        sa.Column("operator_group_id", sa.String),
        sa.Column("viewer_group_id", sa.String),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ─── onboarding_logs ─────────────────────────────────────────────
    op.create_table(
        "onboarding_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vm_id", UUID(as_uuid=True), sa.ForeignKey("virtual_machines.id", ondelete="CASCADE")),
        sa.Column("status", sa.String, nullable=False),
        sa.Column("message", sa.Text),
        sa.Column("details", JSON),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_onboarding_logs_vm_id", "onboarding_logs", ["vm_id"])

    # ─── onboarding_settings ─────────────────────────────────────────
    op.create_table(
        "onboarding_settings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("zone_id", UUID(as_uuid=True), sa.ForeignKey("zones.id", ondelete="CASCADE")),
        sa.Column("workgroup", sa.String, nullable=False),
        sa.Column("functional_account", sa.String),
        sa.Column("account_names", sa.String, nullable=False, server_default="Administrator"),
        sa.Column("account_type_rule", sa.String, nullable=False, server_default="auto"),
        sa.Column("quickrule", sa.String),
        sa.Column("default_password", sa.String),
        sa.Column("automanage_system", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("automanage_accounts", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("change_frequency_type", sa.String, nullable=False, server_default="xdays"),
        sa.Column("change_frequency_days", sa.Integer, nullable=False, server_default="30"),
        sa.Column("change_time", sa.String, nullable=False, server_default="23:30"),
        sa.Column("max_concurrent_requests", sa.Integer, nullable=False, server_default="1"),
        sa.Column("system_description_template", sa.String, nullable=False, server_default="Azure VM: {{vm_name}} | RG: {{resource_group}} | {{os_type}}"),
        sa.Column("account_description_template", sa.String, nullable=False, server_default="{{account_name}} on {{vm_name}}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ─── onboarding_rules ────────────────────────────────────────────
    op.create_table(
        "onboarding_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("zone_id", UUID(as_uuid=True), sa.ForeignKey("zones.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("os_group", sa.String, nullable=False),
        sa.Column("domain_type", sa.String, nullable=False, server_default="any"),
        sa.Column("managed_system_platform_id", sa.Integer, nullable=False),
        sa.Column("managed_system_platform_name", sa.String),
        sa.Column("functional_account_id", sa.String, nullable=False),
        sa.Column("functional_account_name", sa.String),
        sa.Column("functional_account_platform_id", sa.Integer),
        sa.Column("account_names", ARRAY(sa.String), nullable=False, server_default="{}"),
        sa.Column("quick_rule_id", sa.String),
        sa.Column("quick_rule_name", sa.String),
        sa.Column("password_policy_id", sa.Integer),
        sa.Column("password_policy_name", sa.String),
        sa.Column("workgroup_id", sa.String),
        sa.Column("workgroup_name", sa.String),
        sa.Column("is_default", sa.Boolean, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_onboarding_rules_zone_id", "onboarding_rules", ["zone_id"])

    # ─── password_failures ───────────────────────────────────────────
    op.create_table(
        "password_failures",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("managed_account_id", sa.Integer),
        sa.Column("managed_system_id", sa.Integer),
        sa.Column("account_name", sa.String, nullable=False),
        sa.Column("system_name", sa.String, nullable=False, server_default=""),
        sa.Column("domain_name", sa.String),
        sa.Column("platform_name", sa.String),
        sa.Column("workgroup_id", sa.Integer),
        sa.Column("workgroup_name", sa.String, nullable=False, server_default=""),
        sa.Column("zone_id", UUID(as_uuid=True), sa.ForeignKey("zones.id")),
        sa.Column("failure_count", sa.Integer, server_default="1"),
        sa.Column("failure_reason", sa.Text),
        sa.Column("last_change_attempt", sa.DateTime(timezone=True)),
        sa.Column("last_change_result", sa.String),
        sa.Column("first_failure_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("import_source", sa.String, server_default="api"),
        sa.Column("import_batch_date", sa.DateTime(timezone=True)),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("record_type", sa.String, nullable=False, server_default="failure"),
        sa.Column("last_import_job_id", UUID(as_uuid=True)),
        sa.UniqueConstraint("account_name", "system_name", "record_type", "import_source", "workgroup_name", name="uq_pf_upsert_key"),
    )

    # ─── password_failure_snapshots ──────────────────────────────────
    op.create_table(
        "password_failure_snapshots",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("snapshot_date", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("zone_id", UUID(as_uuid=True), sa.ForeignKey("zones.id")),
        sa.Column("zone_code", sa.String),
        sa.Column("total_failures", sa.Integer, nullable=False, server_default="0"),
        sa.Column("import_source", sa.String, server_default="csv"),
        sa.Column("record_type", sa.String, nullable=False, server_default="failure"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ─── import_jobs ─────────────────────────────────────────────────
    op.create_table(
        "import_jobs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("status", sa.String, nullable=False, server_default="pending"),
        sa.Column("mode", sa.String, nullable=False, server_default="diff"),
        sa.Column("total_lines", sa.Integer, server_default="0"),
        sa.Column("processed_lines", sa.Integer, server_default="0"),
        sa.Column("stats", JSON),
        sa.Column("error_message", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
    )

    # ─── BeyondTrust cache tables ────────────────────────────────────
    op.create_table(
        "bt_platforms_cache",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("platform_id", sa.Integer, unique=True, nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("short_name", sa.String),
        sa.Column("port_flag", sa.Boolean, server_default="false"),
        sa.Column("default_port", sa.Integer),
        sa.Column("supports_elevation", sa.Boolean, server_default="false"),
        sa.Column("domain_name_flag", sa.Boolean, server_default="false"),
        sa.Column("auto_management_flag", sa.Boolean, server_default="false"),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "bt_workgroups_cache",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("workgroup_id", sa.Integer, unique=True, nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "bt_functional_accounts_cache",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("functional_account_id", sa.Integer, unique=True, nullable=False),
        sa.Column("display_name", sa.String, nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("platform_id", sa.Integer),
        sa.Column("domain_name", sa.String),
        sa.Column("account_name", sa.String),
        sa.Column("elevation_command", sa.String),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "bt_quick_rules_cache",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("smart_rule_id", sa.Integer, unique=True, nullable=False),
        sa.Column("title", sa.String, nullable=False),
        sa.Column("category", sa.String),
        sa.Column("description", sa.Text),
        sa.Column("account_count", sa.Integer, server_default="0"),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "bt_password_policies_cache",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("policy_id", sa.Integer, unique=True, nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("minimum_length", sa.Integer),
        sa.Column("maximum_length", sa.Integer),
        sa.Column("first_character_requirement", sa.String),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "bt_sync_status",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("resource_type", sa.String, unique=True, nullable=False),
        sa.Column("last_sync_at", sa.DateTime(timezone=True)),
        sa.Column("record_count", sa.Integer, server_default="0"),
        sa.Column("status", sa.String, server_default="pending"),
        sa.Column("error_message", sa.Text),
    )

    # ─── system_maintenance_jobs ─────────────────────────────────────
    op.create_table(
        "system_maintenance_jobs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("job_type", sa.String, nullable=False),
        sa.Column("status", sa.String, nullable=False, server_default="pending"),
        sa.Column("requested_by", UUID(as_uuid=True), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("output", sa.Text),
        sa.Column("error", sa.Text),
        sa.Column("metadata", JSON),
    )

    # ─── sync_progress ───────────────────────────────────────────────
    op.create_table(
        "sync_progress",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("sync_type", sa.String, nullable=False, server_default="azure_vms"),
        sa.Column("status", sa.String, nullable=False, server_default="running"),
        sa.Column("current_step", sa.String),
        sa.Column("processed_count", sa.Integer, server_default="0"),
        sa.Column("total_count", sa.Integer, server_default="0"),
        sa.Column("vm_id", UUID(as_uuid=True), sa.ForeignKey("virtual_machines.id")),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("error_message", sa.Text),
    )

    # ─── sync_history ────────────────────────────────────────────────
    op.create_table(
        "sync_history",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("trigger_type", sa.String, nullable=False),
        sa.Column("zone_id", UUID(as_uuid=True), sa.ForeignKey("zones.id")),
        sa.Column("schedule_type", sa.String),
        sa.Column("zones_processed", sa.Integer, server_default="0"),
        sa.Column("results", JSON),
        sa.Column("status", sa.String, nullable=False, server_default="running"),
        sa.Column("duration_ms", sa.Integer),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ─── user_roles (kept for future Keycloak) ───────────────────────
    op.create_table(
        "user_roles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.String, unique=True, nullable=False),
        sa.Column("role", sa.String, nullable=False, server_default="viewer"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "user_zone_roles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.String, nullable=False),
        sa.Column("zone_id", UUID(as_uuid=True), sa.ForeignKey("zones.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String, nullable=False, server_default="viewer"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "zone_id"),
    )


def downgrade() -> None:
    op.drop_table("user_zone_roles")
    op.drop_table("user_roles")
    op.drop_table("sync_history")
    op.drop_table("sync_progress")
    op.drop_table("system_maintenance_jobs")
    op.drop_table("bt_sync_status")
    op.drop_table("bt_password_policies_cache")
    op.drop_table("bt_quick_rules_cache")
    op.drop_table("bt_functional_accounts_cache")
    op.drop_table("bt_workgroups_cache")
    op.drop_table("bt_platforms_cache")
    op.drop_table("import_jobs")
    op.drop_table("password_failure_snapshots")
    op.drop_table("password_failures")
    op.drop_table("onboarding_rules")
    op.drop_table("onboarding_settings")
    op.drop_table("onboarding_logs")
    op.drop_table("zone_sso_config")
    op.drop_table("zone_schedules")
    op.drop_table("zone_azure_config")
    op.drop_table("automation_configs")
    op.drop_table("app_secrets")
    op.drop_table("virtual_machines")
    op.drop_table("zones")
