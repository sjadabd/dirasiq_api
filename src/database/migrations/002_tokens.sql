-- ============================================================================
-- 002_tokens.sql
-- ----------------------------------------------------------------------------
-- Per-device session tokens for JWT revocation and OneSignal push routing.
-- One row per active session. Logout deletes the row.
--
-- Consolidates from v1:
--   - 002_create_tokens_table.sql
--
-- v2 corrections (vs v1):
--   - TIMESTAMPTZ for created_at, expires_at (was TIMESTAMP without TZ).
--   - Inline FK is kept; the duplicate `CONSTRAINT fk_tokens_user_id` is removed
--     (it referenced the same target — redundant).
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tokens (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token               VARCHAR(500) NOT NULL,
    expires_at          TIMESTAMPTZ  NOT NULL,
    onesignal_player_id VARCHAR(255),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON COLUMN tokens.token               IS 'The raw JWT string. Used by the auth middleware to confirm the token has not been revoked.';
COMMENT ON COLUMN tokens.onesignal_player_id IS 'OneSignal Player ID associated with this device/session. Used to target push notifications.';

CREATE INDEX IF NOT EXISTS idx_tokens_user_id             ON tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_token               ON tokens (token);
CREATE INDEX IF NOT EXISTS idx_tokens_expires_at          ON tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_tokens_onesignal_player_id ON tokens (onesignal_player_id);

-- ---------------------------------------------------------------------------
-- Helper: clean expired tokens. Intended for cron-style invocation; not used
-- as a trigger. Today it's called manually or via node-cron from the app.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION clean_expired_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM tokens WHERE expires_at < now();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION clean_expired_tokens() IS
    'Deletes all token rows whose expires_at has passed. Returns the number of deleted rows. Call from cron / a maintenance job.';
