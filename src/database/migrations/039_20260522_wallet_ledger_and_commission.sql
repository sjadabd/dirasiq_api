-- ============================================================================
-- 039_20260522_wallet_ledger_and_commission.sql
-- ----------------------------------------------------------------------------
-- Phase 7 — financial foundation for the new revenue-sharing model.
--
-- Three concerns, four objects:
--   * Wallet v2:    teacher_wallets gets pending_balance + withdrawable_balance
--                   (the old balance column is rebuilt as pending + withdrawable).
--   * Ledger:       wallet_ledger — append-only history of every credit / debit.
--                   Every wallet mutation MUST go through the ledger; the
--                   balance columns on teacher_wallets are derived state.
--   * Commission:   platform_commission_tiers — global tiered defaults keyed
--                   on course price (sale_price_iqd range).
--   * Override:     teacher_commission_overrides — super-admin set per teacher;
--                   if set, wins over the tier match.
--
-- The wallet engine code uses SELECT ... FOR UPDATE on teacher_wallets to
-- serialise concurrent credits/debits per teacher and recompute the two
-- balance columns inside one transaction with the ledger insert.
--
-- Idempotent:    yes (IF NOT EXISTS / IF NOT EXISTS on columns)
-- Transactional: runner-managed
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. teacher_wallets v2 — split balance into pending vs withdrawable.
-- ---------------------------------------------------------------------------
ALTER TABLE teacher_wallets
  ADD COLUMN IF NOT EXISTS pending_balance      DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS withdrawable_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_earnings    DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_withdrawn   DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'teacher_wallets_pending_nonneg'
    ) THEN
        ALTER TABLE teacher_wallets
            ADD CONSTRAINT teacher_wallets_pending_nonneg
            CHECK (pending_balance >= 0);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'teacher_wallets_withdrawable_nonneg'
    ) THEN
        ALTER TABLE teacher_wallets
            ADD CONSTRAINT teacher_wallets_withdrawable_nonneg
            CHECK (withdrawable_balance >= 0);
    END IF;
END $$;

COMMENT ON COLUMN teacher_wallets.pending_balance      IS 'Amount held until the T+7 settlement window passes (refund window).';
COMMENT ON COLUMN teacher_wallets.withdrawable_balance IS 'Amount the teacher can request a payout for.';
COMMENT ON COLUMN teacher_wallets.lifetime_earnings    IS 'Total credited net (after commission) across the wallet history.';
COMMENT ON COLUMN teacher_wallets.lifetime_withdrawn   IS 'Total paid out across the wallet history.';

-- Re-use the shared updated_at trigger.
DROP TRIGGER IF EXISTS trg_teacher_wallets_updated_at ON teacher_wallets;
CREATE TRIGGER trg_teacher_wallets_updated_at
    BEFORE UPDATE ON teacher_wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. wallet_ledger — append-only history.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallet_ledger (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id         UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    -- Direction-agnostic; sign on `amount` is +credit / -debit.
    entry_type         VARCHAR(40)  NOT NULL CHECK (entry_type IN (
        'enrollment_credit',          -- net (after commission) credited to pending
        'platform_commission',        -- the commission slice (informational; not on wallet)
        'gateway_fee',                -- Wayl/processor fee (informational; not on wallet)
        'pending_to_withdrawable',    -- T+7 maturity sweep
        'withdrawal_hold',            -- debit withdrawable when a withdrawal request is created
        'withdrawal_release',         -- credit withdrawable back if the request is rejected
        'withdrawal_paid',            -- final write-off when admin marks it paid
        'refund_debit',               -- claw back a previously-credited enrollment
        'manual_adjustment_credit',
        'manual_adjustment_debit'
    )),

    amount             DECIMAL(14,2) NOT NULL,
    -- Snapshot of balances AFTER this entry was applied (for fast audits).
    balance_pending_after      DECIMAL(14,2) NOT NULL,
    balance_withdrawable_after DECIMAL(14,2) NOT NULL,

    -- Relations (any may be null depending on entry_type).
    related_enrollment_id   UUID,  -- FK added when video_course_enrollments exists (Phase 14)
    related_withdrawal_id   UUID,  -- FK added in the same commit as 040 below
    related_wayl_link_id    UUID REFERENCES wayl_payment_links(id) ON DELETE SET NULL,

    -- Audit + idempotency.
    actor_user_id      UUID         REFERENCES users(id) ON DELETE SET NULL,
    idempotency_key    VARCHAR(120) UNIQUE,  -- callers pass this to make retries safe
    notes              TEXT,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  wallet_ledger IS 'Append-only history of every wallet mutation. Source of truth for teacher_wallets balances.';
COMMENT ON COLUMN wallet_ledger.idempotency_key IS 'Optional caller-supplied key — used to make a retried credit/debit a no-op instead of a double entry.';

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_teacher_created
    ON wallet_ledger (teacher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_entry_type
    ON wallet_ledger (entry_type);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_enrollment
    ON wallet_ledger (related_enrollment_id)
    WHERE related_enrollment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_withdrawal
    ON wallet_ledger (related_withdrawal_id)
    WHERE related_withdrawal_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. platform_commission_tiers — global defaults by sale-price band.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_commission_tiers (
    id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name                     VARCHAR(50)  NOT NULL,                    -- 'low' / 'medium' / 'high_volume'
    min_sale_price_iqd       DECIMAL(14,2) NOT NULL CHECK (min_sale_price_iqd >= 0),
    max_sale_price_iqd       DECIMAL(14,2),                            -- NULL = open upper bound
    commission_percent       DECIMAL(5,2)  NOT NULL CHECK (commission_percent >= 0 AND commission_percent <= 100),
    is_active                BOOLEAN       NOT NULL DEFAULT true,
    sort_order               INTEGER       NOT NULL DEFAULT 0,
    created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_platform_commission_tiers_updated_at ON platform_commission_tiers;
CREATE TRIGGER trg_platform_commission_tiers_updated_at
    BEFORE UPDATE ON platform_commission_tiers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_commission_tiers_active_sort
    ON platform_commission_tiers (is_active, sort_order);

-- Seed the three defaults the product agreed on. Idempotent — no-op if rows
-- with the same `name` already exist. The runner re-runs this whole file on
-- a clean install only (checksum gate); subsequent boots skip it entirely.
INSERT INTO platform_commission_tiers
    (name, min_sale_price_iqd, max_sale_price_iqd, commission_percent, sort_order)
SELECT * FROM (VALUES
    ('low',         0::DECIMAL(14,2),         50000::DECIMAL(14,2),  15::DECIMAL(5,2),  1),
    ('medium',      50000.01::DECIMAL(14,2),  200000::DECIMAL(14,2), 12::DECIMAL(5,2),  2),
    ('high_volume', 200000.01::DECIMAL(14,2), NULL::DECIMAL(14,2),    8::DECIMAL(5,2),  3)
) AS seed(name, min_sale_price_iqd, max_sale_price_iqd, commission_percent, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM platform_commission_tiers t WHERE t.name = seed.name
);

-- ---------------------------------------------------------------------------
-- 4. teacher_commission_overrides — per-teacher overrides set by super-admin.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teacher_commission_overrides (
    teacher_id          UUID          PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    commission_percent  DECIMAL(5,2)  NOT NULL CHECK (commission_percent >= 0 AND commission_percent <= 100),
    reason              TEXT,
    set_by              UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_teacher_commission_overrides_updated_at ON teacher_commission_overrides;
CREATE TRIGGER trg_teacher_commission_overrides_updated_at
    BEFORE UPDATE ON teacher_commission_overrides
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE teacher_commission_overrides IS 'When present, overrides the tier-based commission for the given teacher. Used for premium / partnership deals.';
