-- ============================================================================
-- 031_index_pass.sql
-- ----------------------------------------------------------------------------
-- Performance index pass. Strictly ADDITIVE — adds 10 hot-path indexes
-- identified by auditing src/models/*.ts query patterns against the v2
-- schema. No table or column changes; no data movement; reversible by
-- DROP INDEX.
--
-- Each index targets a specific query pattern the application runs
-- repeatedly. Existing v2 indexes that already cover a pattern were not
-- duplicated.
--
-- Naming convention: idx_<table>_<purpose>.
--
-- Audit source: model files under dirasiq_api/src/models/*.ts.
--
-- Idempotent:    yes (CREATE INDEX IF NOT EXISTS)
-- Transactional: handled by the runner
-- Reversible:    DROP INDEX <name>
-- ============================================================================

-- ---------------------------------------------------------------------------
-- course_bookings — student / teacher per-study-year listings
-- ---------------------------------------------------------------------------
-- Query: WHERE student_id = $1 AND study_year = $2 ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_course_bookings_student_study_year
    ON course_bookings (student_id, study_year, created_at DESC)
    WHERE is_deleted = FALSE;

-- Query: WHERE teacher_id = $1 AND study_year = $2 ORDER BY created_at DESC
-- Complements the existing idx_course_bookings_pending_inbox (which only
-- covers the pending/pre_approved subset).
CREATE INDEX IF NOT EXISTS idx_course_bookings_teacher_study_year
    ON course_bookings (teacher_id, study_year, created_at DESC)
    WHERE is_deleted = FALSE;

-- ---------------------------------------------------------------------------
-- courses — student discovery by grade
-- ---------------------------------------------------------------------------
-- Query: WHERE grade_id = ANY($1) AND is_deleted = FALSE ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_courses_grade_active
    ON courses (grade_id, created_at DESC)
    WHERE is_deleted = FALSE;

-- ---------------------------------------------------------------------------
-- student_grades — active-grades lookups
-- ---------------------------------------------------------------------------
-- Query: WHERE student_id = $1 AND is_active = TRUE AND deleted_at IS NULL ORDER BY created_at DESC
-- Complements idx_student_grades_lookup (keyed on study_year, not created_at).
CREATE INDEX IF NOT EXISTS idx_student_grades_active_student
    ON student_grades (student_id, created_at DESC)
    WHERE deleted_at IS NULL AND is_active = TRUE;

-- Query: WHERE grade_id = $1 AND study_year = $2 AND is_active = TRUE
-- "Who is registered in this grade for this year?" — admin / teacher view.
CREATE INDEX IF NOT EXISTS idx_student_grades_grade_study_active
    ON student_grades (grade_id, study_year)
    WHERE deleted_at IS NULL AND is_active = TRUE;

-- ---------------------------------------------------------------------------
-- assignments — teacher's assignment list
-- ---------------------------------------------------------------------------
-- Query: WHERE teacher_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC
-- Different from idx_assignments_active (keyed on course_id, due_date).
CREATE INDEX IF NOT EXISTS idx_assignments_teacher_active
    ON assignments (teacher_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- exams — teacher's exam calendar
-- ---------------------------------------------------------------------------
-- Query: WHERE teacher_id = $1 ORDER BY exam_date DESC, created_at DESC
-- Different from idx_exams_course_date (keyed on course_id).
CREATE INDEX IF NOT EXISTS idx_exams_teacher_date
    ON exams (teacher_id, exam_date DESC);

-- ---------------------------------------------------------------------------
-- exam_grades — grading interface "show grades for exam X"
-- ---------------------------------------------------------------------------
-- Query: WHERE exam_id = $1 ORDER BY graded_at DESC NULLS LAST
-- The existing idx_exam_grades_student is keyed on student_id; this one
-- serves the teacher's "review one exam" view.
CREATE INDEX IF NOT EXISTS idx_exam_grades_exam_date
    ON exam_grades (exam_id, graded_at DESC NULLS LAST);

-- ---------------------------------------------------------------------------
-- tokens — "active tokens for user X"
-- ---------------------------------------------------------------------------
-- Query: WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP ORDER BY created_at DESC
-- Note: no WHERE clause on the index. PostgreSQL rejects partial-index
-- predicates that use now() (it's STABLE, not IMMUTABLE). The full composite
-- (user_id, expires_at) lets the planner range-scan to the cutoff.
CREATE INDEX IF NOT EXISTS idx_tokens_user_expires
    ON tokens (user_id, expires_at DESC);

-- ---------------------------------------------------------------------------
-- reservation_payments — teacher's report
-- ---------------------------------------------------------------------------
-- Query: WHERE teacher_id = $1 [AND other filters] ORDER BY created_at DESC
-- Existing idx_res_pay_teacher_id is a simple single-column index; this
-- composite enables index-only scans for the chronological listing.
CREATE INDEX IF NOT EXISTS idx_reservation_payments_teacher_date
    ON reservation_payments (teacher_id, created_at DESC);
