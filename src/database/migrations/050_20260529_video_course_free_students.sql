-- ============================================================================
-- 050_20260529_video_course_free_students.sql
-- ----------------------------------------------------------------------------
-- Whitelist of students who get free access to a paid video course (e.g.
-- top performers, scholarship recipients, the teacher's own children).
-- Only meaningful when access_type='marketplace_paid' — for the two free
-- access types the whitelist is moot (everyone qualified already gets it).
--
-- The pivot intentionally does NOT enforce that the parent video_course
-- has access_type='marketplace_paid'. We allow whitelist rows on free
-- video courses too — they cost nothing to store, and the teacher might
-- promote a free course to paid later without losing their handpicked
-- grants. The access function ignores the whitelist for free courses.
--
-- granted_by + reason are audit metadata; nullable so legacy / scripted
-- grants without an admin actor still parse cleanly.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS video_course_free_students (
    video_course_id UUID        NOT NULL REFERENCES video_courses(id) ON DELETE CASCADE,
    student_id      UUID        NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by      UUID                 REFERENCES users(id)         ON DELETE SET NULL,
    reason          TEXT,

    PRIMARY KEY (video_course_id, student_id)
);

-- Hot path: "which video courses is student S whitelisted on?" — used by
-- the access function + the student "my library" filter.
CREATE INDEX IF NOT EXISTS idx_vcfs_student
    ON video_course_free_students (student_id);

-- Hot path: "who is whitelisted on video course V?" — admin / teacher
-- view + the edit-set sync.
CREATE INDEX IF NOT EXISTS idx_vcfs_video_course
    ON video_course_free_students (video_course_id);

COMMENT ON TABLE video_course_free_students IS
    'Per-video-course whitelist of students who get free access. Bypasses payment for marketplace_paid courses. Read by fn_student_can_view_video_course (migration 053).';
COMMENT ON COLUMN video_course_free_students.granted_by IS
    'Audit: which user (teacher OR super-admin) added the row. Nullable for scripted backfills.';
COMMENT ON COLUMN video_course_free_students.reason IS
    'Free-text audit reason (e.g. "Top of class — March 2026"). Visible to admin moderators only.';
