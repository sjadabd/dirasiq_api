-- ============================================================================
-- 016_teacher_subscription_bonuses.sql
-- ----------------------------------------------------------------------------
-- Bonus seats granted to a specific teacher_subscription (from referrals,
-- promos, etc.) with optional expiry.
--
-- Consolidates from v1:
--   - 033_create_teacher_subscription_bonuses_table.sql
--
-- v2 corrections (vs v1):
--   - TIMESTAMPTZ.
--   - FK to teacher_subscriptions now declares ON DELETE CASCADE explicitly
--     (v1 omitted, defaulted to NO ACTION — would fail if the parent row is
--     deleted with bonuses present).
--   - CHECK on bonus_value > 0 (a bonus row of zero seats is meaningless).
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS teacher_subscription_bonuses (
    id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_subscription_id UUID         NOT NULL
        REFERENCES teacher_subscriptions(id) ON DELETE CASCADE,
    bonus_type              VARCHAR(32)  NOT NULL,
    bonus_value             INTEGER      NOT NULL CHECK (bonus_value > 0),
    expires_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON COLUMN teacher_subscription_bonuses.bonus_type IS
    'Free-form classification: e.g. "referral", "promo", "manual". The application enumerates valid values.';

CREATE INDEX IF NOT EXISTS idx_teacher_subscription_bonuses_subscription
    ON teacher_subscription_bonuses (teacher_subscription_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subscription_bonuses_expires
    ON teacher_subscription_bonuses (expires_at);

-- "What bonuses never expire for subscription X?" — perpetual bonuses.
-- (PostgreSQL refuses now() in a partial-index predicate because it's STABLE,
-- not IMMUTABLE. So the broader "active today" filter has to live in the
-- application query, using the two indexes above as a starting point.)
CREATE INDEX IF NOT EXISTS idx_teacher_subscription_bonuses_perpetual
    ON teacher_subscription_bonuses (teacher_subscription_id)
    WHERE expires_at IS NULL;
