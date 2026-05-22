-- ============================================================================
-- 035_20260522_teacher_applications.sql
-- ----------------------------------------------------------------------------
-- Teacher Onboarding — Phase 1 of the Application & Approval System.
--
-- Captures a teacher's *intent* to join the platform. Rows live here until a
-- super-admin acts on them (approve / reject / needs_more_info). When
-- approved, the approve handler (Phase 2) will mint a real `users` row + a
-- `teacher_wallets` row in one transaction and NULL out `password_hash` here.
--
-- Why a separate table (not just users.status='pending'):
--   - Applications carry CV/identity data (certificate, national id) that
--     should never sit on the auth-bearing users row.
--   - Resubmission after rejection (30-day cooldown — see service layer) is
--     easier to model as multiple rows with status history than mutating one
--     users row.
--   - Keeps `users` strictly post-approval; auth code does not need to know
--     about a "draft" state.
--
-- Resubmission rule (enforced in service, not SQL):
--   - For (email OR phone), at most one row may exist in status IN
--     ('pending','approved','needs_more_info') — enforced here as a partial
--     unique index, two of them, to fail loudly at the DB layer if the
--     service check is bypassed.
--   - A rejected row blocks new submissions for 30 days from `rejected_at`.
--
-- Idempotent:    yes
-- Transactional: handled by the runner (each file runs inside its own tx).
-- ============================================================================

CREATE TABLE IF NOT EXISTS teacher_applications (
    id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    first_name               VARCHAR(100) NOT NULL,
    last_name                VARCHAR(100) NOT NULL,
    full_name                VARCHAR(255) NOT NULL,
    phone                    VARCHAR(20)  NOT NULL,
    email                    CITEXT       NOT NULL,
    password_hash            TEXT,                  -- NULLed after approval-transfer (Phase 2)

    gender                   VARCHAR(10)  NOT NULL CHECK (gender IN ('male','female')),
    birth_date               DATE         NOT NULL,

    -- Location
    city                     VARCHAR(100) NOT NULL,
    area                     VARCHAR(100) NOT NULL,

    -- Teaching profile
    subject                  VARCHAR(100) NOT NULL,
    teaching_stage           VARCHAR(100) NOT NULL,
    years_of_experience      INTEGER      NOT NULL CHECK (years_of_experience >= 0 AND years_of_experience <= 60),
    current_workplace        VARCHAR(255),
    has_physical_courses     BOOLEAN      NOT NULL DEFAULT false,
    estimated_student_count  INTEGER      NOT NULL DEFAULT 0
                              CHECK (estimated_student_count >= 0 AND estimated_student_count <= 100000),

    bio                      TEXT,

    -- Social handles (stored as full URLs OR @handles — validated client/service-side)
    facebook_url             VARCHAR(500),
    instagram_url            VARCHAR(500),
    telegram_url             VARCHAR(500),
    tiktok_url               VARCHAR(500),
    youtube_url              VARCHAR(500),

    -- Uploaded asset paths — populated in Phase 3 (private file uploads).
    -- Stored as /uploads/teacher-applications/<id>/<filename> relative paths.
    profile_image            VARCHAR(500),
    certificate_image        VARCHAR(500),
    national_id_image        VARCHAR(500),
    optional_attachment      VARCHAR(500),
    intro_video_url          VARCHAR(500),

    -- Workflow
    application_status       VARCHAR(20)  NOT NULL DEFAULT 'pending'
                              CHECK (application_status IN ('pending','approved','rejected','needs_more_info')),
    rejection_reason         TEXT,
    admin_notes              TEXT,

    -- Audit trail
    approved_by              UUID         REFERENCES users(id) ON DELETE SET NULL,
    approved_at              TIMESTAMPTZ,
    rejected_at              TIMESTAMPTZ,                                            -- powers the 30-day cooldown
    needs_more_info_at       TIMESTAMPTZ,

    created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at               TIMESTAMPTZ
);

COMMENT ON TABLE  teacher_applications IS 'Pre-approval teacher join requests. Approved rows mint a users row in Phase 2.';
COMMENT ON COLUMN teacher_applications.password_hash IS 'bcrypt hash collected at submit-time; nulled after approval moves it into users.password.';
COMMENT ON COLUMN teacher_applications.application_status IS 'pending → approved | rejected | needs_more_info';
COMMENT ON COLUMN teacher_applications.admin_notes IS 'Super-admin internal notes; never shown to the applicant.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Workflow hot path: super-admin filtering by status, newest first.
CREATE INDEX IF NOT EXISTS idx_teacher_applications_status_created
    ON teacher_applications (application_status, created_at DESC)
    WHERE deleted_at IS NULL;

-- Email/phone lookups during anti-duplicate checks at submission time.
CREATE INDEX IF NOT EXISTS idx_teacher_applications_email
    ON teacher_applications (email)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_teacher_applications_phone
    ON teacher_applications (phone)
    WHERE deleted_at IS NULL;

-- Defence in depth: prevent two open applications for the same email/phone.
-- The service layer also enforces this and produces a friendly error; this
-- partial unique index exists so a race condition cannot bypass the check.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_teacher_applications_open_email
    ON teacher_applications (email)
    WHERE deleted_at IS NULL
      AND application_status IN ('pending','approved','needs_more_info');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_teacher_applications_open_phone
    ON teacher_applications (phone)
    WHERE deleted_at IS NULL
      AND application_status IN ('pending','approved','needs_more_info');

-- ---------------------------------------------------------------------------
-- updated_at trigger (reuses shared function from 001_create_users_table.sql)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_teacher_applications_updated_at ON teacher_applications;
CREATE TRIGGER trg_teacher_applications_updated_at
    BEFORE UPDATE ON teacher_applications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
