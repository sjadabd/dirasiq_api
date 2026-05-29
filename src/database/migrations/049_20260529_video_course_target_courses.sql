-- ============================================================================
-- 049_20260529_video_course_target_courses.sql
-- ----------------------------------------------------------------------------
-- Many-to-many between video_courses and the live (booking-based) courses
-- table. UNLIKE video_course_grade_targets, this pivot does NOT participate
-- in access control — it drives UI display only:
--
--   "Which video courses should appear inside the Course Hub of live
--    course X?"
--
-- An empty pivot for a video_course is the common case (the video is in
-- the marketplace / public catalog but not pinned to any specific live
-- course). Rows here flip on the Videos section of the Course Hub for
-- the matching live course.
--
-- Access enforcement still goes through fn_student_can_view_video_course
-- (migration 053). A student who sees a video card inside a Course Hub
-- thanks to this pivot but does not pass the access function gets a
-- "buy to watch" overlay instead of playback — that's by design and
-- expected for marketplace_paid videos linked to live courses.
--
-- Ownership invariant (enforced in service layer, NOT here):
--   For every row, video_courses.teacher_id MUST equal
--   courses.teacher_id. A teacher can only pin THEIR OWN video courses
--   to THEIR OWN live courses. We do not add a deferred trigger here
--   because the service-level check is sufficient AND a trigger would
--   complicate the admin-side moderation flow (admin can adjust pivots
--   when a teacher account is being reassigned). Defence-in-depth via
--   service + admin-only moderation gates.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS video_course_target_courses (
    video_course_id UUID        NOT NULL REFERENCES video_courses(id) ON DELETE CASCADE,
    course_id       UUID        NOT NULL REFERENCES courses(id)       ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (video_course_id, course_id)
);

-- Hot path: "which live courses does this video course pin to?" — used
-- by the teacher edit form + the admin moderation panel.
CREATE INDEX IF NOT EXISTS idx_vctc_video_course
    ON video_course_target_courses (video_course_id);

-- Hot path: "which video courses appear in this live course's Hub?" —
-- used by Course Hub videos section render.
CREATE INDEX IF NOT EXISTS idx_vctc_course
    ON video_course_target_courses (course_id);

COMMENT ON TABLE video_course_target_courses IS
    'Many-to-many UI-only pivot. Determines which video courses surface inside the Course Hub of which live courses. NOT used for access decisions — see fn_student_can_view_video_course in migration 053.';
