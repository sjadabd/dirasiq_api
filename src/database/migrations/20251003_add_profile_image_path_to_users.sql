-- Migration: Add profile_image_path to users
-- Safe to run multiple times

ALTER TABLE users
ADD COLUMN IF NOT EXISTS profile_image_path TEXT;

COMMENT ON COLUMN users.profile_image_path IS
'Path to user avatar under /public/uploads/users, returned as profileImagePath in API.';
