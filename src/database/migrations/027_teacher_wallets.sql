-- ============================================================================
-- 027_teacher_wallets.sql
-- ----------------------------------------------------------------------------
-- Per-teacher financial balance plus the append-only transaction ledger.
-- One wallet row per teacher; many transaction rows per wallet.
--
-- Consolidates from v1:
--   - 035_create_teacher_wallets_table.sql
--   - 036_create_teacher_wallet_transactions_table.sql
--
-- v2 corrections (vs v1):
--   - **FK from teacher_wallets.teacher_id → users.id changed from
--     ON DELETE CASCADE to ON DELETE RESTRICT** (DATABASE_ANALYSIS.md §8
--     Critical finding #6: financial / audit data must not cascade-delete
--     from a user). To delete a user, soft-delete and reassign their wallet.
--   - **FK from teacher_wallet_transactions.teacher_id → users.id changed to
--     ON DELETE RESTRICT** for the same reason.
--   - TIMESTAMPTZ throughout.
--   - Per-table `update_teacher_wallets_updated_at_column()` trigger function
--     replaced by the shared `update_updated_at_column()`.
--   - CHECK on amount != 0 (every ledger entry should move money).
--   - CHECK that balance_after = balance_before + amount (idempotency invariant).
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- teacher_wallets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teacher_wallets (
    teacher_id UUID          PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
    balance    DECIMAL(14,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE teacher_wallets IS
    'One row per teacher. Balance is the cached aggregate of all transactions; the application is responsible for keeping it consistent with teacher_wallet_transactions.';

CREATE INDEX IF NOT EXISTS idx_teacher_wallets_balance ON teacher_wallets (balance);

DROP TRIGGER IF EXISTS update_teacher_wallets_updated_at ON teacher_wallets;
CREATE TRIGGER update_teacher_wallets_updated_at
    BEFORE UPDATE ON teacher_wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- teacher_wallet_transactions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teacher_wallet_transactions (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id      UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    txn_type        VARCHAR(20)   NOT NULL,
    amount          DECIMAL(14,2) NOT NULL CHECK (amount <> 0),
    balance_before  DECIMAL(14,2) NOT NULL,
    balance_after   DECIMAL(14,2) NOT NULL,
    reference_type  VARCHAR(40),
    reference_id    TEXT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT teacher_wallet_transactions_balance_math
        CHECK (balance_after = balance_before + amount)
);

COMMENT ON TABLE teacher_wallet_transactions IS
    'Append-only ledger. Never UPDATE or DELETE existing rows. balance_before / balance_after let auditors verify each transaction in isolation.';
COMMENT ON COLUMN teacher_wallet_transactions.amount IS
    'Positive for credits, negative for debits. CHECK enforces amount <> 0 (a no-op transaction makes no sense in a ledger).';

CREATE INDEX IF NOT EXISTS idx_teacher_wallet_transactions_teacher_id ON teacher_wallet_transactions (teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_wallet_transactions_created_at ON teacher_wallet_transactions (created_at);
CREATE INDEX IF NOT EXISTS idx_teacher_wallet_transactions_reference  ON teacher_wallet_transactions (reference_type, reference_id);

-- Hot path: "teacher's recent transactions"
CREATE INDEX IF NOT EXISTS idx_teacher_wallet_transactions_history
    ON teacher_wallet_transactions (teacher_id, created_at DESC);
