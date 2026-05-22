-- ============================================================================
-- 042_20260522_teacher_application_status_check.sql
-- ----------------------------------------------------------------------------
-- Phase 8.12 — Status-check OTP infrastructure on `teacher_applications`.
--
-- Adds a second, independent OTP slot on each application row. Used by the
-- public "where is my application?" screen (Flutter + dashboard later) so an
-- applicant who is pending / rejected / needs_more_info can retrieve the
-- current status without already holding a JWT.
--
-- Why a second slot (and not reusing email_verification_*):
--   - email_verification_code_hash is nulled the moment the initial email
--     is verified. After that the columns are dead for that row.
--   - The status-check OTP must remain usable AFTER initial verification
--     succeeded (the whole point is the post-submit lookup).
--   - Reusing the columns would couple two separate lifecycles and force
--     awkward "did the user verify yet?" branching in the service. The
--     dedicated columns keep each flow independent and idempotent.
--
-- Anti-enumeration is enforced in the service layer, not here — the request
-- endpoint always reports success, and the verify endpoint collapses
-- "no row" and "wrong code" into the same INVALID_CODE error.
--
-- Per-row throttle (1 OTP per 60s) is enforced via status_check_requested_at
-- in the service.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

BEGIN;

ALTER TABLE teacher_applications
    ADD COLUMN IF NOT EXISTS status_check_code_hash    TEXT,
    ADD COLUMN IF NOT EXISTS status_check_expires_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS status_check_attempts     INTEGER     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS status_check_requested_at TIMESTAMPTZ;

COMMENT ON COLUMN teacher_applications.status_check_code_hash
    IS 'bcrypt hash of the 6-digit OTP issued by /api/teacher-applications/status/request. NULL when no live code.';
COMMENT ON COLUMN teacher_applications.status_check_expires_at
    IS 'Expiry timestamp of the issued status-check OTP. NULL when no live code.';
COMMENT ON COLUMN teacher_applications.status_check_attempts
    IS 'Wrong-code counter for the current status-check OTP. Locked at EMAIL_OTP_MAX_ATTEMPTS (default 5).';
COMMENT ON COLUMN teacher_applications.status_check_requested_at
    IS 'Last time a status-check OTP was issued for this row. Used to throttle re-requests (1/60s).';

COMMIT;
