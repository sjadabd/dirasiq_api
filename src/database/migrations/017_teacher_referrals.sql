-- ============================================================================
-- 017_teacher_referrals.sql
-- ----------------------------------------------------------------------------
-- Teacher-to-teacher referral tracking: when teacher A invites teacher B via
-- a referral code, a row is created here.
--
-- Consolidates from v1:
--   - 032_create_teacher_referrals_table.sql
--
-- v2 corrections (vs v1):
--   - **Explicit ON DELETE clauses on both FKs** (v1 omitted these, defaulting
--     to NO ACTION — DATABASE_ANALYSIS.md §8 Critical finding #2).
--       • referrer_teacher_id → CASCADE  (if the referrer is deleted, the
--         referral row goes with them; the referred teacher's account
--         remains).
--       • referred_teacher_id → SET NULL (preserve the historical record
--         even if the referred account is deleted — but then there's
--         nothing to reward).
--   - TIMESTAMPTZ.
--   - Uses shared `update_updated_at_column()`; per-table function removed.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS teacher_referrals (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_teacher_id UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_teacher_id UUID                  REFERENCES users(id) ON DELETE SET NULL,
    referral_code_used  TEXT         NOT NULL,
    status              VARCHAR(20)  NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','completed','rejected')),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT unique_referred_teacher UNIQUE (referred_teacher_id),
    CONSTRAINT unique_referral_pair    UNIQUE (referrer_teacher_id, referred_teacher_id),
    CONSTRAINT no_self_referral        CHECK  (referrer_teacher_id <> referred_teacher_id)
);

COMMENT ON COLUMN teacher_referrals.referred_teacher_id IS
    'NULL after the referred teacher deletes their account. The row is retained for audit; downstream rewards must check NOT NULL before paying out.';

CREATE INDEX IF NOT EXISTS idx_teacher_referrals_referrer ON teacher_referrals (referrer_teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_referrals_referred ON teacher_referrals (referred_teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_referrals_status   ON teacher_referrals (status);

DROP TRIGGER IF EXISTS update_teacher_referrals_updated_at ON teacher_referrals;
CREATE TRIGGER update_teacher_referrals_updated_at
    BEFORE UPDATE ON teacher_referrals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
