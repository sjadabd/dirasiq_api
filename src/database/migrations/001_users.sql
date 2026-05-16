-- ============================================================================
-- 001_users.sql
-- ----------------------------------------------------------------------------
-- Users (super_admin / teacher / student) with location, OAuth, verification,
-- teacher QR code, profile image, and teacher intro video metadata.
--
-- Consolidates from v1:
--   - 001_create_users_table.sql
--   - 20251003_add_profile_image_path_to_users.sql
--   - 20251025_add_intro_video_to_users.sql
--
-- v2 corrections (vs v1):
--   - All timestamps are TIMESTAMPTZ (was TIMESTAMP without TZ).
--   - CHECK on latitude / longitude ranges.
--   - Partial UNIQUE on (auth_provider, oauth_provider_id) WHERE oauth_provider_id IS NOT NULL.
--   - Lowercase-email invariant enforced via CHECK.
--   - Shared `update_updated_at_column()` trigger function defined once here
--     and reused by every other table.
--
-- Idempotent:    yes (IF NOT EXISTS on table; OR REPLACE on function; DROP IF
--                EXISTS before CREATE on triggers).
-- Transactional: handled by the runner.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Shared trigger function used by every table that has an `updated_at` column.
-- Defined here in 001 so subsequent migrations can rely on it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_updated_at_column() IS
    'Shared BEFORE UPDATE trigger function. Stamps NEW.updated_at = now() on every row update.';

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    name                        VARCHAR(255) NOT NULL,
    email                       VARCHAR(255) NOT NULL UNIQUE,
    password                    VARCHAR(255) NOT NULL,
    user_type                   VARCHAR(20)  NOT NULL CHECK (user_type IN ('super_admin','teacher','student')),
    status                      VARCHAR(20)  NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending','active','inactive','suspended')),

    -- Teacher-specific
    phone                       VARCHAR(20),
    address                     TEXT,
    bio                         TEXT,
    experience_years            INTEGER,
    visitor_id                  VARCHAR(255),
    device_info                 TEXT,

    -- Student-specific
    student_phone               VARCHAR(20),
    parent_phone                VARCHAR(20),
    school_name                 VARCHAR(255),
    gender                      VARCHAR(10) CHECK (gender IN ('male','female')),
    birth_date                  DATE,

    -- Location
    latitude                    DECIMAL(10,8) CHECK (latitude  BETWEEN -90  AND 90),
    longitude                   DECIMAL(11,8) CHECK (longitude BETWEEN -180 AND 180),
    formatted_address           TEXT,
    country                     VARCHAR(100),
    city                        VARCHAR(100),
    state                       VARCHAR(100),
    zipcode                     VARCHAR(20),
    street_name                 VARCHAR(255),
    suburb                      VARCHAR(100),
    location_confidence         DECIMAL(3,2),

    -- Email verification
    email_verified              BOOLEAN      NOT NULL DEFAULT FALSE,
    verification_code           VARCHAR(6),
    verification_code_expires   TIMESTAMPTZ,

    -- Password reset
    password_reset_code         VARCHAR(6),
    password_reset_expires      TIMESTAMPTZ,

    -- OAuth
    auth_provider               VARCHAR(20)  NOT NULL DEFAULT 'email',
    oauth_provider_id           VARCHAR(255),

    -- Teacher QR code (reusable attendance QR — file path)
    teacher_qr_image_path       TEXT,

    -- Profile image
    profile_image_path          TEXT,

    -- Teacher intro video (HLS manifest + thumbnail + duration)
    intro_video_status          VARCHAR(20)  NOT NULL DEFAULT 'none'
                                    CHECK (intro_video_status IN ('none','processing','ready','failed')),
    intro_video_manifest_path   TEXT,
    intro_video_storage_dir     TEXT,
    intro_video_thumbnail_path  TEXT,
    intro_video_duration_seconds INTEGER,

    -- Lifecycle
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at                  TIMESTAMPTZ,

    -- Lowercase-email invariant. Application code must normalize on insert.
    CONSTRAINT users_email_lowercase CHECK (email = LOWER(email))
);

COMMENT ON COLUMN users.teacher_qr_image_path  IS 'Path to the teacher''s reusable attendance QR image (e.g. /public/uploads/courses/<course_id>/qr.png).';
COMMENT ON COLUMN users.profile_image_path     IS 'Path to user avatar under /public/uploads/users, returned as profileImagePath in API.';
COMMENT ON COLUMN users.intro_video_status     IS 'Lifecycle of the teacher intro video pipeline: none → processing → ready (or failed).';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX        IF NOT EXISTS idx_users_email                 ON users (email);
CREATE INDEX        IF NOT EXISTS idx_users_user_type             ON users (user_type);
CREATE INDEX        IF NOT EXISTS idx_users_status                ON users (status);
CREATE INDEX        IF NOT EXISTS idx_users_created_at            ON users (created_at);
CREATE INDEX        IF NOT EXISTS idx_users_student_phone         ON users (student_phone);
CREATE INDEX        IF NOT EXISTS idx_users_parent_phone          ON users (parent_phone);
CREATE INDEX        IF NOT EXISTS idx_users_birth_date            ON users (birth_date);
CREATE INDEX        IF NOT EXISTS idx_users_location              ON users (latitude, longitude);
CREATE INDEX        IF NOT EXISTS idx_users_auth_provider         ON users (auth_provider);
CREATE INDEX        IF NOT EXISTS idx_users_intro_video_status    ON users (intro_video_status);

-- Partial UNIQUE on the OAuth identity. Prevents two accounts sharing a
-- (provider, provider_user_id) pair. NULL provider_id rows are excluded.
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_oauth_identity
    ON users (auth_provider, oauth_provider_id)
    WHERE oauth_provider_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
