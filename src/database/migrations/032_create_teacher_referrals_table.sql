-- Create teacher_referrals table to track teacher invitation referrals
CREATE TABLE IF NOT EXISTS teacher_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_teacher_id UUID NOT NULL REFERENCES users(id),
    referred_teacher_id UUID NOT NULL REFERENCES users(id),
    referral_code_used TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_referred_teacher UNIQUE (referred_teacher_id),
    CONSTRAINT unique_referral_pair UNIQUE (referrer_teacher_id, referred_teacher_id),
    CONSTRAINT no_self_referral CHECK (referrer_teacher_id <> referred_teacher_id)
);

-- Indexes for faster lookup
CREATE INDEX IF NOT EXISTS idx_teacher_referrals_referrer ON teacher_referrals(referrer_teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_referrals_referred ON teacher_referrals(referred_teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_referrals_status ON teacher_referrals(status);

-- Trigger to auto-update updated_at on change
CREATE OR REPLACE FUNCTION update_teacher_referrals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_teacher_referrals_updated_at ON teacher_referrals;
CREATE TRIGGER update_teacher_referrals_updated_at
    BEFORE UPDATE ON teacher_referrals
    FOR EACH ROW
    EXECUTE FUNCTION update_teacher_referrals_updated_at();
