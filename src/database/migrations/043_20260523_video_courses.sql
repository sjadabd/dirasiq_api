-- ============================================================================
-- 043_20260523_video_courses.sql
-- ----------------------------------------------------------------------------
-- Phase 10.1.A — Video learning foundation.
--
-- Introduces two new domain tables:
--   * video_courses  — a curated collection of pre-recorded video lessons
--                      owned by an approved teacher. Distinct from the
--                      existing `courses` table (which models live/booked
--                      classroom courses with sessions, attendance, etc.).
--   * video_lessons  — one playable video per row, backed by Bunny Stream.
--
-- Why separate from `courses`:
--   - The classroom-course flow ties into booking → invoice → wallet, has
--     seat capacity, schedule, attendance. Pre-recorded video has none of
--     that. Co-locating both concepts on one table would force every
--     existing query to thread a `course_type` check and silently broaden
--     joins. A separate domain keeps each side simple.
--
-- Bunny Stream is the chosen video host. The tables intentionally store
-- only Bunny IDs + status — the bytes never live on the VPS or in PG.
--   - bunny_video_id        : Bunny's per-video UUID
--   - bunny_library_id      : the Bunny library the video belongs to
--   - bunny_status          : pending → uploaded → processing → ready | failed
--   - bunny_thumbnail_url   : Bunny CDN thumbnail (kept for fast list render)
--   - bunny_playback_url    : Bunny CDN HLS playlist URL (signed at runtime
--                             with HMAC-SHA256 before being handed to clients)
--   - bunny_last_synced_at  : last time the row was reconciled with Bunny
--                             (via webhook OR a forced re-sync)
--
-- Workflow:
--   1. Teacher creates a video_course (status='pending_review').
--   2. Teacher creates lessons; each lesson POSTs to Bunny to mint a videoId,
--      then a separate upload PUT streams the bytes to Bunny.
--   3. Bunny webhook fires when processing completes → bunny_status='ready'.
--   4. Super-admin reviews the course → status='approved' (or 'rejected' /
--      'hidden').
--   5. Students see the course only when status='approved'
--      AND visibility='public' AND every lesson has bunny_status='ready'.
--
-- The CREATE / UPDATE / DELETE teacher endpoints + the Bunny upload flow
-- land in Phase 10.1.B. This migration only sets up the schema; the
-- read endpoints + admin moderation actions in 10.1.A operate on rows
-- that arrive via seed scripts (for local) or direct INSERTs (initial prod).
--
-- Idempotent:    yes
-- Transactional: handled by the runner (each file runs inside its own tx).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- video_courses
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS video_courses (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Owner (an active teacher account). CASCADE on user delete because a
    -- soft-deleted teacher should still see their content vanish for clients
    -- (admins can restore from backups if needed).
    teacher_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Curriculum surface
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    subject         VARCHAR(100) NOT NULL,
    teaching_stage  VARCHAR(100) NOT NULL,
    grade_id        UUID         REFERENCES grades(id) ON DELETE SET NULL,
    cover_image     VARCHAR(500),

    -- Pricing — Phase 10.1 only ships is_free=true courses end-to-end.
    -- The price column + is_free flag are persisted now so a future
    -- migration doesn't have to widen the table; payment wiring lands
    -- with the wallet / wayl integration in a later phase.
    price           DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    is_free         BOOLEAN       NOT NULL DEFAULT TRUE,

    -- Discoverability
    visibility      VARCHAR(20)  NOT NULL DEFAULT 'private'
                    CHECK (visibility IN ('private','public')),

    -- Moderation workflow (super-admin owned)
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending_review'
                    CHECK (status IN ('pending_review','approved','hidden','rejected')),
    reviewed_by     UUID         REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at     TIMESTAMPTZ,
    review_notes    TEXT,

    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

COMMENT ON TABLE  video_courses                IS 'Teacher-owned pre-recorded video courses. Distinct from `courses` (live/booked).';
COMMENT ON COLUMN video_courses.is_free        IS 'Phase 10.1 ships free only. Paid is gated until wallet/Wayl wiring lands in a later phase.';
COMMENT ON COLUMN video_courses.visibility     IS 'private = invisible to students; public = students may see when status=approved.';
COMMENT ON COLUMN video_courses.status         IS 'pending_review → approved | hidden | rejected. Owned by super-admin moderation.';
COMMENT ON COLUMN video_courses.review_notes   IS 'Super-admin moderation note. Shown to the teacher; never logged.';

-- Hot paths
CREATE INDEX IF NOT EXISTS idx_video_courses_teacher
    ON video_courses (teacher_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_video_courses_status_visibility_created
    ON video_courses (status, visibility, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_video_courses_subject
    ON video_courses (subject)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_video_courses_stage
    ON video_courses (teaching_stage)
    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_video_courses_updated_at ON video_courses;
CREATE TRIGGER trg_video_courses_updated_at
    BEFORE UPDATE ON video_courses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- video_lessons
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS video_lessons (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id            UUID         NOT NULL REFERENCES video_courses(id) ON DELETE CASCADE,

    title                VARCHAR(200) NOT NULL,
    description          TEXT,

    -- Curriculum ordering. We use display_order (not "order") so the column
    -- name does not collide with the SQL keyword in ORDER BY clauses.
    display_order        INTEGER      NOT NULL DEFAULT 0,
    duration_seconds     INTEGER      CHECK (duration_seconds IS NULL OR duration_seconds >= 0),

    -- Bunny Stream metadata (see header for the field semantics)
    bunny_library_id     VARCHAR(64),
    bunny_video_id       VARCHAR(64),
    bunny_thumbnail_url  VARCHAR(1000),
    bunny_playback_url   VARCHAR(1000),
    bunny_status         VARCHAR(30)  NOT NULL DEFAULT 'pending'
                         CHECK (bunny_status IN ('pending','uploaded','processing','ready','failed')),
    bunny_last_synced_at TIMESTAMPTZ,

    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at           TIMESTAMPTZ
);

COMMENT ON TABLE  video_lessons                    IS 'One pre-recorded video per row, hosted on Bunny Stream.';
COMMENT ON COLUMN video_lessons.bunny_status       IS 'Mirrors Bunny''s processing lifecycle. Webhook-updated.';
COMMENT ON COLUMN video_lessons.bunny_playback_url IS 'HLS manifest URL. Signed at request time with HMAC-SHA256 before exposure to clients.';

-- Hot paths
CREATE INDEX IF NOT EXISTS idx_video_lessons_course_order
    ON video_lessons (course_id, display_order)
    WHERE deleted_at IS NULL;

-- Lookup by Bunny videoId — used by the webhook handler to reconcile state.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_video_lessons_bunny_video
    ON video_lessons (bunny_video_id)
    WHERE deleted_at IS NULL AND bunny_video_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_video_lessons_updated_at ON video_lessons;
CREATE TRIGGER trg_video_lessons_updated_at
    BEFORE UPDATE ON video_lessons
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;
