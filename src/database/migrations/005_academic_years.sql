-- ============================================================================
-- 005_academic_years.sql
-- ----------------------------------------------------------------------------
-- Reference table of school years ("2024-2025"). At most one row may have
-- is_active = TRUE at any time, enforced by a trigger.
--
-- Consolidates from v1:
--   - 003_create_academic_years_table.sql
--
-- v2 corrections (vs v1):
--   - gen_random_uuid() (was uuid_generate_v4 — required uuid-ossp).
--   - TIMESTAMPTZ explicitly (v1 already used it, just normalising syntax).
--   - The single-active-row trigger is kept verbatim — it's the right pattern.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS academic_years (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    year       VARCHAR(9)  NOT NULL UNIQUE CHECK (year ~ '^\d{4}-\d{4}$'),
    is_active  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN academic_years.year IS 'Format: YYYY-YYYY (e.g. "2024-2025").';

CREATE INDEX IF NOT EXISTS idx_academic_years_year      ON academic_years (year);
CREATE INDEX IF NOT EXISTS idx_academic_years_is_active ON academic_years (is_active);

DROP TRIGGER IF EXISTS update_academic_years_updated_at ON academic_years;
CREATE TRIGGER update_academic_years_updated_at
    BEFORE UPDATE ON academic_years
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Single-active-year enforcement.
-- When a row's is_active is set to TRUE, all other rows are flipped to FALSE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ensure_single_active_academic_year()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_active = TRUE THEN
        UPDATE academic_years
           SET is_active = FALSE
         WHERE id <> NEW.id
           AND is_active = TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION ensure_single_active_academic_year() IS
    'BEFORE UPDATE/INSERT trigger that enforces at most one active academic_year row.';

DROP TRIGGER IF EXISTS trigger_ensure_single_active_academic_year ON academic_years;
CREATE TRIGGER trigger_ensure_single_active_academic_year
    BEFORE INSERT OR UPDATE ON academic_years
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_active_academic_year();
