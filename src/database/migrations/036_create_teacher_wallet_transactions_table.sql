CREATE TABLE IF NOT EXISTS teacher_wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    txn_type VARCHAR(20) NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    balance_before DECIMAL(14,2) NOT NULL,
    balance_after DECIMAL(14,2) NOT NULL,
    reference_type VARCHAR(40),
    reference_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_teacher_wallet_transactions_teacher_id ON teacher_wallet_transactions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_wallet_transactions_created_at ON teacher_wallet_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_teacher_wallet_transactions_reference ON teacher_wallet_transactions(reference_type, reference_id);
