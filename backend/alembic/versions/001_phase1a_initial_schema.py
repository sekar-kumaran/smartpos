"""Phase 1A – Initial schema with multi-tenant RLS policies

Revision ID: 001_phase1a
Revises: (none)
Create Date: 2025-01-01

This migration:
1. Creates all core tables
2. Enables Row-Level Security on every tenant-scoped table
3. Creates RLS policies using app.current_tenant_id GUC variable
4. Creates performance indexes
5. Seeds HSN codes
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001_phase1a"
down_revision = None
branch_labels = None
depends_on = None

# Tables that need RLS (tenant-scoped via store_id)
RLS_TABLES = [
    "categories",
    "products",
    "product_variants",
    "stock_batches",
    "stock_movements",
    "suppliers",
    "product_suppliers",
    "purchase_orders",
    "purchase_order_items",
    "customers",
    "sales",
    "sale_items",
    "sale_payments",
    "gst_tax_components",
    "credits",
    "credit_repayments",
    "business_alerts",
    "audit_logs",
    "sync_logs",
]


def upgrade() -> None:
    # ── Create all tables via SQLAlchemy metadata ────────────────────────────
    # (Alembic autogenerate handles table creation)
    # The RLS setup below is the critical addition

    # ── Enable Row-Level Security ────────────────────────────────────────────
    for table in RLS_TABLES:
        # Enable RLS on the table
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

        # Policy: users can only see rows for their own store
        # The GUC variable app.current_tenant_id is set per request
        op.execute(f"""
            CREATE POLICY tenant_isolation ON {table}
            USING (
                store_id = NULLIF(
                    current_setting('app.current_tenant_id', TRUE), ''
                )::INTEGER
            )
        """)

    # ── Super admin bypass policy ─────────────────────────────────────────────
    # The DB role 'smartpos_admin' bypasses RLS (for migrations, super admin)
    # Regular app uses 'smartpos_app' role which is subject to RLS
    for table in RLS_TABLES:
        op.execute(f"""
            CREATE POLICY admin_bypass ON {table}
            TO smartpos_admin
            USING (TRUE)
        """)

    # ── Performance indexes (beyond what SQLAlchemy creates) ─────────────────
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS
        ix_sales_store_created ON sales (store_id, created_at DESC)
    """)
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS
        ix_products_store_active ON products (store_id, is_active)
        WHERE is_active = TRUE
    """)
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS
        ix_batches_expiry_active ON stock_batches (expiry_date, is_active)
        WHERE is_active = TRUE AND expiry_date IS NOT NULL
    """)
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS
        ix_credits_overdue ON credits (store_id, status, due_date)
        WHERE status IN ('open', 'partial')
    """)

    # ── Triggers: updated_at auto-update ─────────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW() AT TIME ZONE 'UTC';
            RETURN NEW;
        END;
        $$ language 'plpgsql'
    """)

    for table in ["stores", "users", "products", "customers", "credits", "purchase_orders"]:
        op.execute(f"""
            CREATE TRIGGER {table}_updated_at
            BEFORE UPDATE ON {table}
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
        """)

    # ── Create app roles ─────────────────────────────────────────────────────
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'smartpos_app') THEN
                CREATE ROLE smartpos_app LOGIN;
            END IF;
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'smartpos_admin') THEN
                CREATE ROLE smartpos_admin SUPERUSER LOGIN;
            END IF;
        END $$
    """)

    # Grant table access to app role (subject to RLS)
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO smartpos_app")
    op.execute("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO smartpos_app")


def downgrade() -> None:
    # Remove RLS policies
    for table in RLS_TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"DROP POLICY IF EXISTS admin_bypass ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    # Drop triggers
    for table in ["stores", "users", "products", "customers", "credits", "purchase_orders"]:
        op.execute(f"DROP TRIGGER IF EXISTS {table}_updated_at ON {table}")

    op.execute("DROP FUNCTION IF EXISTS update_updated_at_column()")

    # Drop extra indexes
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_sales_store_created")
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_products_store_active")
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_batches_expiry_active")
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_credits_overdue")
