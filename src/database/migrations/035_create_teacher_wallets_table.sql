CREATE TABLE IF NOT EXISTS teacher_wallets (
    teacher_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance DECIMAL(14,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_teacher_wallets_balance ON teacher_wallets(balance);

CREATE OR REPLACE FUNCTION update_teacher_wallets_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_teacher_wallets_updated_at ON teacher_wallets;
CREATE TRIGGER update_teacher_wallets_updated_at
    BEFORE UPDATE ON teacher_wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_teacher_wallets_updated_at_column();
