-- ============================================================================
-- 045_20260529_teacher_application_grades.sql
-- ----------------------------------------------------------------------------
-- Many-to-many join between teacher_applications and grades.
--
-- Before this migration: an application held a single free-text
-- `teaching_stage` string + an even more freeform `custom_teaching_stage`
-- because the client picked from a static TS catalog
-- (`src/data/teacher-application-catalog.ts`). The catalog drifted from the
-- super-admin-managed `grades` table — a teacher could "teach" a stage that
-- didn't exist as a real grade row, which made downstream features (booking
-- eligibility, course-grade dropdowns) impossible to wire cleanly.
--
-- After this migration: the application carries an explicit set of grade
-- ids referencing `grades(id)`. On approval the rows are mirrored into
-- `teacher_grades` so the teacher's "what I teach" list is already
-- populated before they log in for the first time.
--
-- The legacy `teaching_stage` column on `teacher_applications` is kept
-- (still NOT NULL) and auto-populated by the service as a comma-joined
-- display string of the chosen grade names — preserves admin-review UX
-- without a destructive ALTER.
--
-- Idempotent:    yes (IF NOT EXISTS on table + indexes).
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS teacher_application_grades (
    application_id UUID        NOT NULL REFERENCES teacher_applications(id) ON DELETE CASCADE,
    grade_id       UUID        NOT NULL REFERENCES grades(id)               ON DELETE RESTRICT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (application_id, grade_id)
);

-- Lookup by grade (e.g. "which applications selected grade X?").
CREATE INDEX IF NOT EXISTS idx_teacher_application_grades_grade_id
    ON teacher_application_grades (grade_id);

COMMENT ON TABLE teacher_application_grades IS
    'Grades the teacher declared they teach when applying. Copied to teacher_grades on approval (with the active study_year). See 045_*.sql header.';
