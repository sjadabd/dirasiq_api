-- Create teacher_subscription_bonuses table to store bonus seats for teacher subscriptions
CREATE TABLE IF NOT EXISTS teacher_subscription_bonuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_subscription_id UUID NOT NULL REFERENCES teacher_subscriptions(id),
    bonus_type VARCHAR(32) NOT NULL,
    bonus_value INT NOT NULL,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_teacher_subscription_bonuses_subscription
    ON teacher_subscription_bonuses(teacher_subscription_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subscription_bonuses_expires
    ON teacher_subscription_bonuses(expires_at);
