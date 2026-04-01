"""Add enrichment columns for BeyondTrust Managed Accounts API sync

Revision ID: 002_enrichment
Revises: 001_initial
Create Date: 2026-04-01
"""
from alembic import op
import sqlalchemy as sa

revision = "002_enrichment"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add enrichment columns to password_failures
    op.add_column("password_failures", sa.Column("host_name", sa.String, nullable=True))
    op.add_column("password_failures", sa.Column("ip_address", sa.String, nullable=True))
    op.add_column("password_failures", sa.Column("dns_name", sa.String, nullable=True))
    op.add_column("password_failures", sa.Column("distinguished_name", sa.String, nullable=True))
    op.add_column("password_failures", sa.Column("sam_account_name", sa.String, nullable=True))
    op.add_column("password_failures", sa.Column("user_principal_name", sa.String, nullable=True))
    op.add_column("password_failures", sa.Column("change_state", sa.Integer, nullable=True))
    op.add_column("password_failures", sa.Column("change_state_description", sa.String, nullable=True))
    op.add_column("password_failures", sa.Column("auto_management_flag", sa.Boolean, nullable=True))
    op.add_column("password_failures", sa.Column("password_rule_name", sa.String, nullable=True))
    op.add_column("password_failures", sa.Column("last_change_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column("password_failures", sa.Column("next_change_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column("password_failures", sa.Column("change_frequency_type", sa.String, nullable=True))
    op.add_column("password_failures", sa.Column("change_frequency_days", sa.Integer, nullable=True))
    op.add_column("password_failures", sa.Column("release_duration", sa.Integer, nullable=True))
    op.add_column("password_failures", sa.Column("max_release_duration", sa.Integer, nullable=True))
    op.add_column("password_failures", sa.Column("api_enabled", sa.Boolean, nullable=True))
    op.add_column("password_failures", sa.Column("api_account_data", sa.JSON, nullable=True))

    # Convert managed_account_id unique index to partial (WHERE NOT NULL)
    op.drop_index("ix_pf_managed_account", table_name="password_failures")
    op.execute(
        "CREATE UNIQUE INDEX ix_pf_managed_account ON password_failures (managed_account_id) "
        "WHERE managed_account_id IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_index("ix_pf_managed_account", table_name="password_failures")
    op.create_index("ix_pf_managed_account", "password_failures", ["managed_account_id"], unique=True)

    op.drop_column("password_failures", "api_account_data")
    op.drop_column("password_failures", "api_enabled")
    op.drop_column("password_failures", "max_release_duration")
    op.drop_column("password_failures", "release_duration")
    op.drop_column("password_failures", "change_frequency_days")
    op.drop_column("password_failures", "change_frequency_type")
    op.drop_column("password_failures", "next_change_date")
    op.drop_column("password_failures", "last_change_date")
    op.drop_column("password_failures", "password_rule_name")
    op.drop_column("password_failures", "auto_management_flag")
    op.drop_column("password_failures", "change_state_description")
    op.drop_column("password_failures", "change_state")
    op.drop_column("password_failures", "user_principal_name")
    op.drop_column("password_failures", "sam_account_name")
    op.drop_column("password_failures", "distinguished_name")
    op.drop_column("password_failures", "dns_name")
    op.drop_column("password_failures", "ip_address")
    op.drop_column("password_failures", "host_name")
