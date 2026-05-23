-- ============================================================================
-- 044_20260523_intro_video_bunny.sql
-- ----------------------------------------------------------------------------
-- Phase 10.1.B.2 — Migrate teacher intro videos from local VPS HLS to
-- Bunny Stream.
--
-- Adds Bunny-side columns alongside the existing local-path columns so old
-- records keep playing (read path falls back to the local manifest when
-- bunny_video_id is NULL) and new uploads go straight to Bunny.
--
-- New columns (NULL-allowed; backfill happens lazily as teachers re-upload):
--   intro_video_bunny_library_id        VARCHAR(64)
--   intro_video_bunny_video_id          VARCHAR(64)
--   intro_video_bunny_playback_url      VARCHAR(1000)
--   intro_video_bunny_thumbnail_url     VARCHAR(1000)
--   intro_video_bunny_last_synced_at    TIMESTAMPTZ
--
-- CHECK constraint extended:
--   intro_video_status was {none, processing, ready, failed}.
--   It now also accepts {pending, uploaded} so the full Bunny lifecycle
--   (pending → uploaded → processing → ready | failed) fits.
--
-- Index added:
--   uniq_users_intro_video_bunny_video — unique partial index on
--   intro_video_bunny_video_id. Used by the Bunny webhook handler to map
--   "this videoId belongs to a user's intro video" in O(log n) instead of
--   a full scan, and ensures one Bunny video can't be claimed by two users.
--
-- Idempotent:    yes
-- Transactional: handled by the runner (each file runs inside its own tx).
-- ============================================================================

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS intro_video_bunny_library_id     VARCHAR(64),
    ADD COLUMN IF NOT EXISTS intro_video_bunny_video_id       VARCHAR(64),
    ADD COLUMN IF NOT EXISTS intro_video_bunny_playback_url   VARCHAR(1000),
    ADD COLUMN IF NOT EXISTS intro_video_bunny_thumbnail_url  VARCHAR(1000),
    ADD COLUMN IF NOT EXISTS intro_video_bunny_last_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN users.intro_video_bunny_video_id
    IS 'Bunny Stream video GUID. NULL = legacy (local HLS) or no intro video.';
COMMENT ON COLUMN users.intro_video_bunny_playback_url
    IS 'Raw HLS manifest URL — sign before exposing via BunnyStreamService.';

-- Extend the intro_video_status CHECK to cover the full Bunny lifecycle.
-- The constraint name in PostgreSQL is inferred ('users_intro_video_status_check')
-- but `IF EXISTS` keeps this idempotent — drop-then-add works whether the
-- constraint exists yet or not.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_intro_video_status_check;
ALTER TABLE users ADD CONSTRAINT users_intro_video_status_check
    CHECK (intro_video_status IN
        ('none','pending','uploaded','processing','ready','failed'));

-- Webhook lookup index. Partial so the index only covers rows that ACTUALLY
-- carry a Bunny video — the vast majority of users have NULL here.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_intro_video_bunny_video
    ON users (intro_video_bunny_video_id)
    WHERE intro_video_bunny_video_id IS NOT NULL
      AND deleted_at IS NULL;

COMMIT;
