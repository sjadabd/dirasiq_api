-- ============================================================================
-- 040_20260522_teacher_withdrawal_requests.sql
-- ----------------------------------------------------------------------------
-- Phase 7 — withdrawal request workflow.
--
-- A teacher posts a withdrawal request from their wallet's withdrawable
-- balance. The super-admin reviews it, can approve (which locks the
-- amount via a wallet_ledger 'withdrawal_hold' entry), then marks paid
-- after the manual bank/Wayl transfer is done outside the system.
--
-- Flow:
--   pending   →   approved   →   paid
--                  ↓
--                 (admin can also reject from pending or approved)
--   pending   →   rejected   (no wallet change)
--   approved  →   rejected   (releases the held funds back to withdrawable)
--
-- Idempotent:    yes
-- Transactional: runner-managed
-- ============================================================================

CREATE TABLE IF NOT EXISTS teacher_withdrawal_requests (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id           UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    amount_iqd           DECIMAL(14,2) NOT NULL CHECK (amount_iqd > 0),

    status               VARCHAR(20)  NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','approved','rejected','paid')),

    -- Payout details (filled when marked paid).
    payout_method        VARCHAR(30)  CHECK (payout_method IN ('bank_transfer','wayl_manual','cash','other')),
    payout_reference     VARCHAR(255), -- bank reference, transaction id, etc.
    payout_destination   TEXT,         -- redacted IBAN / wallet handle / branch info as text

    -- Optional teacher-supplied destination at request time.
    requested_destination TEXT,
    requested_notes       TEXT,

    -- Admin trail.
    rejection_reason     TEXT,
    admin_notes          TEXT,

    -- Actor + timestamps for each transition.
    approved_by          UUID         REFERENCES users(id) ON DELETE SET NULL,
    approved_at          TIMESTAMPTZ,
    rejected_by          UUID         REFERENCES users(id) ON DELETE SET NULL,
    rejected_at          TIMESTAMPTZ,
    paid_by              UUID         REFERENCES users(id) ON DELETE SET NULL,
    paid_at              TIMESTAMPTZ,

    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  teacher_withdrawal_requests IS 'Teacher payout requests. Lifecycle: pending → approved → paid. Funds move via wallet_ledger entries keyed on related_withdrawal_id.';
COMMENT ON COLUMN teacher_withdrawal_requests.payout_destination IS 'Teacher bank/Wayl info captured at payout time (after admin verification). Stored in the clear for the operations team — do NOT show in any teacher-facing endpoint.';

-- Hot path: super-admin "pending requests" inbox + per-teacher history.
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status_created
    ON teacher_withdrawal_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_teacher_created
    ON teacher_withdrawal_requests (teacher_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_teacher_withdrawal_requests_updated_at ON teacher_withdrawal_requests;
CREATE TRIGGER trg_teacher_withdrawal_requests_updated_at
    BEFORE UPDATE ON teacher_withdrawal_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Wire wallet_ledger.related_withdrawal_id → teacher_withdrawal_requests.id
-- as a real FK now that the target table exists.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'wallet_ledger_withdrawal_fk'
    ) THEN
        ALTER TABLE wallet_ledger
            ADD CONSTRAINT wallet_ledger_withdrawal_fk
            FOREIGN KEY (related_withdrawal_id)
            REFERENCES teacher_withdrawal_requests(id)
            ON DELETE SET NULL;
    END IF;
END $$;
