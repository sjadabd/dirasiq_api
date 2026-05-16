-- ============================================================================
-- 032_hash_otp_codes.sql
-- ----------------------------------------------------------------------------
-- Switch OTP / password-reset codes from plaintext to bcrypt-hashed storage,
-- and add per-user attempt counters to prevent brute-force.
--
-- DATABASE_ANALYSIS.md §10.3-§10.4 — Critical security findings now resolved:
--   • Plaintext 6-digit codes in verification_code / password_reset_code
--     (1M-key space; DB leak = every in-flight OTP exposed).
--   • No attempt counter (1M is brute-forceable in seconds against plaintext
--     equality SQL; bcrypt + attempt limit closes both vectors).
--
-- Schema changes (forward-only, idempotent):
--   1. Widen verification_code      VARCHAR(6) → TEXT  (bcrypt hash ≈ 60 chars)
--   2. Widen password_reset_code    VARCHAR(6) → TEXT
--   3. Add  verification_code_attempts   INTEGER NOT NULL DEFAULT 0
--   4. Add  password_reset_code_attempts INTEGER NOT NULL DEFAULT 0
--
-- Any existing plaintext code rows become invalid after this migration runs
-- (bcrypt.compare against a plaintext stored value will never match). Users
-- with pending verification must request a new code via /auth/resend-verification.
-- On `mulhimiq_local` (the dev DB) there is no live data, so this is a no-op
-- in practice.
--
-- Idempotent:    yes (TYPE TEXT widening is no-op if already TEXT;
--                ADD COLUMN IF NOT EXISTS)
-- Transactional: handled by the runner
-- Reversible:    yes (DROP COLUMN, ALTER TYPE VARCHAR(6) — but in v2 the
--                plan is to never go back)
-- ============================================================================

-- Widen the code columns. PostgreSQL allows VARCHAR(N) → TEXT in-place; any
-- existing 6-character values fit trivially in TEXT.
ALTER TABLE users
    ALTER COLUMN verification_code   TYPE TEXT,
    ALTER COLUMN password_reset_code TYPE TEXT;

-- Add the attempt counters. NOT NULL with DEFAULT 0 means existing rows
-- start at zero attempts.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS verification_code_attempts   INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS password_reset_code_attempts INTEGER NOT NULL DEFAULT 0;

-- Sanity CHECK constraints — attempt counters can't go negative, and a
-- generous upper bound catches bugs where the counter runs away.
ALTER TABLE users
    ADD CONSTRAINT chk_users_verification_attempts_nonneg
        CHECK (verification_code_attempts BETWEEN 0 AND 1000),
    ADD CONSTRAINT chk_users_password_reset_attempts_nonneg
        CHECK (password_reset_code_attempts BETWEEN 0 AND 1000);

COMMENT ON COLUMN users.verification_code IS
    'bcrypt hash of the 6-digit email-verification OTP. NULL means no code is currently pending.';
COMMENT ON COLUMN users.password_reset_code IS
    'bcrypt hash of the 6-digit password-reset OTP. NULL means no reset is currently pending.';
COMMENT ON COLUMN users.verification_code_attempts IS
    'How many failed verifyEmail attempts have been made against the current code. Reset on issue / successful verify. Lock the code when this exceeds OTP_MAX_ATTEMPTS (env, default 5).';
COMMENT ON COLUMN users.password_reset_code_attempts IS
    'Same idea as verification_code_attempts but for password reset.';
