-- ============================================================================
-- 004_app_settings.sql
-- ----------------------------------------------------------------------------
-- Global key/value configuration store. Read by various services (e.g. the
-- booking-confirmation-fee, payment gateway settings).
--
-- Consolidates from v1:
--   - 034_create_app_settings_table.sql
--
-- v2 corrections (vs v1):
--   - TIMESTAMPTZ for created_at, updated_at.
--   - The per-table `update_app_settings_updated_at_column()` trigger function
--     from v1 is REMOVED. The shared `update_updated_at_column()` from 001 is
--     used.
--   - Moved early (was #34 in v1) so seed scripts can rely on this table.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_settings (
    key        VARCHAR(100) PRIMARY KEY,
    value      TEXT         NOT NULL,
    value_type VARCHAR(20)  NOT NULL DEFAULT 'string',
    updated_by UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON COLUMN app_settings.value_type IS
    'Hint for runtime coercion: one of string | number | boolean | json. The application is responsible for the cast — the column is always TEXT.';

CREATE INDEX IF NOT EXISTS idx_app_settings_updated_at ON app_settings (updated_at);

DROP TRIGGER IF EXISTS update_app_settings_updated_at ON app_settings;
CREATE TRIGGER update_app_settings_updated_at
    BEFORE UPDATE ON app_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
