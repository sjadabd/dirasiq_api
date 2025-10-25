-- Add intro video fields to users table for teacher intro video
ALTER TABLE users
ADD COLUMN IF NOT EXISTS intro_video_status VARCHAR(20) DEFAULT 'none' CHECK (intro_video_status IN ('none','processing','ready','failed')),
ADD COLUMN IF NOT EXISTS intro_video_manifest_path TEXT,
ADD COLUMN IF NOT EXISTS intro_video_storage_dir TEXT,
ADD COLUMN IF NOT EXISTS intro_video_thumbnail_path TEXT,
ADD COLUMN IF NOT EXISTS intro_video_duration_seconds INTEGER;

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_users_intro_video_status ON users(intro_video_status);
