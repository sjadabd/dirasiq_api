-- ============================================================================
-- 041_20260523_teacher_application_auth_methods.sql
-- ----------------------------------------------------------------------------
-- Phase 8 bug-fix — teacher onboarding correctness.
--
-- Three concerns:
--   1. The application now supports two signup methods:
--        a) Email + password — requires OTP email-verification BEFORE the
--           super-admin sees the row in the inbox.
--        b) Google — the email arrives already-verified from the idToken;
--           no OTP required. Password is NULL on the row, and we store
--           oauth_provider_id so the approve flow can mint a `google`-
--           provider users row.
--   2. "Other" teaching-stage option: the form may now propose a stage
--      not present in the official `grades` list. The custom value lands
--      on `custom_teaching_stage` and the super-admin can either accept it
--      (and later promote it to the catalogue) or reject it.
--   3. Approve gate hardening — approve flow checks email_verified_at IS
--      NOT NULL so a half-submitted email application can never mint a
--      live user.
--
-- Idempotent:    yes (ADD COLUMN IF NOT EXISTS / DO blocks for constraints)
-- Transactional: runner-managed
-- ============================================================================

ALTER TABLE teacher_applications
  ADD COLUMN IF NOT EXISTS application_auth_provider VARCHAR(20)
        NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS oauth_provider_id         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email_verified_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS custom_teaching_stage     TEXT,
  ADD COLUMN IF NOT EXISTS email_verification_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_verification_attempts   INTEGER NOT NULL DEFAULT 0;

-- CHECK on auth_provider value — restrict to the three providers we accept.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'teacher_applications_auth_provider_check'
    ) THEN
        ALTER TABLE teacher_applications
            ADD CONSTRAINT teacher_applications_auth_provider_check
            CHECK (application_auth_provider IN ('email','google','apple'));
    END IF;

    -- Defence: a google-provider row MUST have an oauth_provider_id (the
    -- Google `sub` claim) so the approve flow can reproduce the binding.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'teacher_applications_oauth_id_when_oauth'
    ) THEN
        ALTER TABLE teacher_applications
            ADD CONSTRAINT teacher_applications_oauth_id_when_oauth
            CHECK (
              application_auth_provider = 'email'
              OR oauth_provider_id IS NOT NULL
            );
    END IF;
END $$;

COMMENT ON COLUMN teacher_applications.application_auth_provider IS
  'How the applicant identified themselves on submit: email | google | apple. Determines whether email-verification OTP is required, and what auth_provider lands on the users row at approval.';
COMMENT ON COLUMN teacher_applications.oauth_provider_id IS
  'For google/apple submissions — the provider-side stable id (Google sub / Apple sub). NULL for email submissions.';
COMMENT ON COLUMN teacher_applications.email_verified_at IS
  'NULL until the applicant proves email control. Email submissions are blocked from approval until this is set; Google submissions get it auto-stamped to NOW() at submit time.';
COMMENT ON COLUMN teacher_applications.custom_teaching_stage IS
  'When teaching_stage = "أخرى" (other), this column carries the free-text the applicant typed. Super-admin reviews and may later promote it to the official grades catalogue.';
COMMENT ON COLUMN teacher_applications.email_verification_code_hash IS
  'bcrypt hash of the 6-digit OTP sent to the applicant. NULLed after a successful verify_email (or when a fresh code is issued).';

-- ---------------------------------------------------------------------------
-- Backfill: rows that existed before this migration ran under the legacy
-- single-path submit (email-only, no OTP gate). Treat them as verified so
-- the new approve guard doesn't accidentally block historical applications.
-- New rows after this point either:
--   - submit via email and start with email_verified_at = NULL until /verify
--   - submit via google and arrive with email_verified_at = NOW()
-- ---------------------------------------------------------------------------
UPDATE teacher_applications
   SET email_verified_at = created_at,
       application_auth_provider = 'email'
 WHERE email_verified_at IS NULL
   AND application_auth_provider = 'email'
   AND created_at < now();

-- Hot path: super-admin "unverified pending applications" filter + the
-- service-level "is this email already in use" check during login blocking.
CREATE INDEX IF NOT EXISTS idx_teacher_applications_email_status
    ON teacher_applications (email, application_status)
    WHERE deleted_at IS NULL;
