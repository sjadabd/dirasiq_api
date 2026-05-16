-- ============================================================================
-- 010_teacher_grades.sql
-- ----------------------------------------------------------------------------
-- Which grade levels a teacher teaches, scoped to a study year. A teacher
-- typically has multiple rows per study_year (one per grade they teach).
--
-- Consolidates from v1:
--   - 008_create_teacher_grades_table.sql
--
-- v2 corrections (vs v1):
--   - TIMESTAMPTZ everywhere.
--   - Uses shared `update_updated_at_column()`.
--   - Adds partial index on (teacher_id, study_year) WHERE deleted_at IS NULL
--     AND is_active = TRUE — used by the teacher-eligibility lookup.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS teacher_grades (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    grade_id   UUID        NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
    study_year VARCHAR(9)  NOT NULL CHECK (study_year ~ '^[0-9]{4}-[0-9]{4}$'),
    is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,

    UNIQUE (teacher_id, grade_id, study_year)
);

CREATE INDEX IF NOT EXISTS idx_teacher_grades_teacher_id  ON teacher_grades (teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_grades_grade_id    ON teacher_grades (grade_id);
CREATE INDEX IF NOT EXISTS idx_teacher_grades_study_year  ON teacher_grades (study_year);
CREATE INDEX IF NOT EXISTS idx_teacher_grades_active      ON teacher_grades (is_active);
CREATE INDEX IF NOT EXISTS idx_teacher_grades_created_at  ON teacher_grades (created_at);

-- Hot path: "which grades does teacher X teach in year Y?"
CREATE INDEX IF NOT EXISTS idx_teacher_grades_lookup
    ON teacher_grades (teacher_id, study_year)
    WHERE deleted_at IS NULL AND is_active = TRUE;

DROP TRIGGER IF EXISTS update_teacher_grades_updated_at ON teacher_grades;
CREATE TRIGGER update_teacher_grades_updated_at
    BEFORE UPDATE ON teacher_grades
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
