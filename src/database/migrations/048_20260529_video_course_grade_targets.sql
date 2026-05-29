-- ============================================================================
-- 048_20260529_video_course_grade_targets.sql
-- ----------------------------------------------------------------------------
-- INCLUDES BACKFILL
--
-- Many-to-many between video_courses and grades. Replaces the single
-- video_courses.grade_id column for access control purposes:
--
--   - A video_course with access_type='public_free_by_grade' is visible
--     to a student iff one of this pivot's grade_ids matches the
--     student's student_grades row for the active study year.
--   - A video_course with access_type='marketplace_paid' uses the same
--     grade match as the *eligibility* gate (in addition to the purchase
--     / whitelist / enrolled-bypass check).
--   - access_type='enrolled_students_free' ignores this pivot entirely
--     (gate is membership, not grade).
--
-- Backfill from video_courses.grade_id is safe-idempotent:
--   - INSERT … SELECT … WHERE grade_id IS NOT NULL filters rows without
--     a grade so the FK never sees NULL.
--   - ON CONFLICT DO NOTHING tolerates re-runs (the pivot is keyed on
--     (video_course_id, grade_id) which would 23505 otherwise).
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS video_course_grade_targets (
    video_course_id UUID        NOT NULL REFERENCES video_courses(id) ON DELETE CASCADE,
    grade_id        UUID        NOT NULL REFERENCES grades(id)        ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (video_course_id, grade_id)
);

-- Hot path: "which grades does video course V target?" — admin/teacher edit.
CREATE INDEX IF NOT EXISTS idx_vcgt_video_course
    ON video_course_grade_targets (video_course_id);

-- Hot path: "which video courses target grade G?" — student catalog filter.
CREATE INDEX IF NOT EXISTS idx_vcgt_grade
    ON video_course_grade_targets (grade_id);

-- Backfill from the legacy single grade_id column. Re-run safe via the
-- ON CONFLICT clause. Rows where grade_id IS NULL stay un-mirrored — the
-- service layer will require explicit grade_targets on create going
-- forward, and old rows without a grade were never functional anyway.
INSERT INTO video_course_grade_targets (video_course_id, grade_id)
SELECT id, grade_id
  FROM video_courses
 WHERE grade_id IS NOT NULL
ON CONFLICT (video_course_id, grade_id) DO NOTHING;

COMMENT ON TABLE video_course_grade_targets IS
    'Grade audience for a video course. Replaces the legacy video_courses.grade_id single-grade column. Empty set = no grade audience (only valid for enrolled_students_free, which gates on teacher relationship instead).';
