-- ============================================================================
-- 009_student_grades.sql
-- ----------------------------------------------------------------------------
-- Which grade level a student is registered in, scoped to a study year.
-- A student can have at most one row per (grade, study_year) but typically
-- has one row per study_year (the current grade).
--
-- Consolidates from v1:
--   - 007_create_student_grades_table.sql
--
-- v2 corrections (vs v1):
--   - TIMESTAMPTZ everywhere.
--   - Uses shared `update_updated_at_column()` (per-table function removed).
--   - Adds partial index on (student_id, study_year) WHERE deleted_at IS NULL
--     AND is_active = TRUE — used by the booking-eligibility lookup.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS student_grades (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    grade_id   UUID        NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
    study_year VARCHAR(9)  NOT NULL CHECK (study_year ~ '^[0-9]{4}-[0-9]{4}$'),
    is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,

    UNIQUE (student_id, grade_id, study_year)
);

CREATE INDEX IF NOT EXISTS idx_student_grades_student_id  ON student_grades (student_id);
CREATE INDEX IF NOT EXISTS idx_student_grades_grade_id    ON student_grades (grade_id);
CREATE INDEX IF NOT EXISTS idx_student_grades_study_year  ON student_grades (study_year);
CREATE INDEX IF NOT EXISTS idx_student_grades_active      ON student_grades (is_active);
CREATE INDEX IF NOT EXISTS idx_student_grades_created_at  ON student_grades (created_at);

-- Hot path: "what is student X's active grade in year Y?"
CREATE INDEX IF NOT EXISTS idx_student_grades_lookup
    ON student_grades (student_id, study_year)
    WHERE deleted_at IS NULL AND is_active = TRUE;

DROP TRIGGER IF EXISTS update_student_grades_updated_at ON student_grades;
CREATE TRIGGER update_student_grades_updated_at
    BEFORE UPDATE ON student_grades
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
