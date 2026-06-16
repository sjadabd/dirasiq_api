-- Migration: account deletion request queue (no immediate delete from mobile)
-- Created: 2026-06-16

BEGIN;

CREATE TABLE IF NOT EXISTS account_deletion_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           CITEXT NOT NULL,
    phone           VARCHAR(32),
    reason          TEXT,
    user_type       VARCHAR(20),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'completed', 'cancelled')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_email
    ON account_deletion_requests (email);

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_pending
    ON account_deletion_requests (created_at DESC)
    WHERE status = 'pending';

DROP TRIGGER IF EXISTS update_account_deletion_requests_updated_at ON account_deletion_requests;
CREATE TRIGGER update_account_deletion_requests_updated_at
    BEFORE UPDATE ON account_deletion_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;
