-- Migration: teacher intro-video admin review lifecycle
-- Created: 2026-07-19
-- Description: Extend intro_video_status with awaiting_review / approved /
-- rejected and store review metadata so students only see approved videos.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS intro_video_reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS intro_video_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS intro_video_review_notes TEXT;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_intro_video_status_check;
ALTER TABLE users ADD CONSTRAINT users_intro_video_status_check
  CHECK (intro_video_status IN (
    'none',
    'pending',
    'uploaded',
    'processing',
    'ready',
    'awaiting_review',
    'approved',
    'rejected',
    'failed'
  ));

-- Existing Bunny-ready intros need admin approval before students see them.
UPDATE users
   SET intro_video_status = 'awaiting_review'
 WHERE intro_video_status = 'ready'
   AND deleted_at IS NULL
   AND user_type = 'teacher';

CREATE INDEX IF NOT EXISTS idx_users_intro_video_awaiting_review
  ON users (intro_video_status, updated_at DESC)
  WHERE deleted_at IS NULL
    AND user_type = 'teacher'
    AND intro_video_status IN ('awaiting_review', 'approved', 'rejected');

COMMIT;
