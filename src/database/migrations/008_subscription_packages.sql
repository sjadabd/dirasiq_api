-- ============================================================================
-- 008_subscription_packages.sql
-- ----------------------------------------------------------------------------
-- SaaS tier definitions for teacher subscriptions. Capacity (max_students)
-- × price × duration_days × is_free defines a tier; teachers buy a tier in
-- the teacher_subscriptions table.
--
-- Consolidates from v1:
--   - 002_create_subscription_packages_table.sql
--
-- v2 corrections (vs v1):
--   - Money column widened to DECIMAL(14,2) (was DECIMAL(10,2)).
--   - TIMESTAMPTZ for all timestamps.
--   - Uses shared `update_updated_at_column()`; per-table trigger function
--     removed.
--   - CHECK constraints added on max_students > 0, price >= 0, duration_days > 0.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscription_packages (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100)  NOT NULL,
    description   TEXT,
    max_students  INTEGER       NOT NULL CHECK (max_students > 0),
    price         DECIMAL(14,2) NOT NULL CHECK (price >= 0),
    duration_days INTEGER       NOT NULL CHECK (duration_days > 0),
    is_free       BOOLEAN       NOT NULL DEFAULT FALSE,
    is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ,

    CONSTRAINT unique_package_name        UNIQUE (name),
    CONSTRAINT unique_package_combination UNIQUE (max_students, price, duration_days, is_free)
);

COMMENT ON COLUMN subscription_packages.is_free IS
    'Marks the free / trial tier. Combined with the (max_students, price, duration_days, is_free) UNIQUE constraint, this allows distinct free and paid tiers with otherwise-identical numbers.';

CREATE INDEX IF NOT EXISTS idx_subscription_packages_name          ON subscription_packages (name);
CREATE INDEX IF NOT EXISTS idx_subscription_packages_is_active     ON subscription_packages (is_active);
CREATE INDEX IF NOT EXISTS idx_subscription_packages_price         ON subscription_packages (price);
CREATE INDEX IF NOT EXISTS idx_subscription_packages_duration_days ON subscription_packages (duration_days);

DROP TRIGGER IF EXISTS update_subscription_packages_updated_at ON subscription_packages;
CREATE TRIGGER update_subscription_packages_updated_at
    BEFORE UPDATE ON subscription_packages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
