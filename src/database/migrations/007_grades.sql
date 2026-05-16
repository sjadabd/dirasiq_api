-- ============================================================================
-- 007_grades.sql
-- ----------------------------------------------------------------------------
-- Grade levels (e.g. "Grade 10", "First Intermediate"). Reference data with
-- soft delete.
--
-- Consolidates from v1:
--   - 005_create_grades_table.sql  (base table)
--   - 009_update_grades_table.sql  (added is_active, deleted_at, indexes)
--
-- v2 corrections (vs v1):
--   - gen_random_uuid() (was uuid_generate_v4).
--   - TIMESTAMPTZ for all timestamps.
--   - All columns inlined; the v1 DO $$ … $$ guards for UNIQUE / ALTER TABLE
--     are removed (no longer needed on a fresh schema).
--   - Adds partial index `(id) WHERE deleted_at IS NULL` for the common
--     "list active grades" path.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS grades (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ,

    CONSTRAINT unique_grade_name UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_grades_name       ON grades (name);
CREATE INDEX IF NOT EXISTS idx_grades_active     ON grades (is_active);
CREATE INDEX IF NOT EXISTS idx_grades_deleted_at ON grades (deleted_at);

-- Hot path: "list active, non-deleted grades, ordered by name"
CREATE INDEX IF NOT EXISTS idx_grades_alive
    ON grades (name)
    WHERE deleted_at IS NULL AND is_active = TRUE;

DROP TRIGGER IF EXISTS update_grades_updated_at ON grades;
CREATE TRIGGER update_grades_updated_at
    BEFORE UPDATE ON grades
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
