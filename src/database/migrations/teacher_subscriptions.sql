-- جدول ربط اشتراك المعلم بالباقات
CREATE TABLE IF NOT EXISTS teacher_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ربط بالمعلم (من جدول users)
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- ربط بالباقـة (من جدول subscription_packages)
    subscription_package_id UUID NOT NULL REFERENCES subscription_packages(id) ON DELETE CASCADE,

    -- فترة الاشتراك
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,

    -- حالة الاشتراك الحالي
    is_active BOOLEAN DEFAULT TRUE,

    -- التواريخ
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,

    -- تأكيد عدم تكرار الاشتراك بنفس الباقة في نفس الفترة
    CONSTRAINT unique_active_subscription_per_teacher UNIQUE (teacher_id, is_active)
);

-- تحسين الأداء عبر الفهارس
CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_teacher_id ON teacher_subscriptions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_package_id ON teacher_subscriptions(subscription_package_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_active ON teacher_subscriptions(is_active);

-- تريجر لتحديث وقت التعديل
CREATE OR REPLACE FUNCTION update_teacher_subscriptions_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_teacher_subscriptions_updated_at ON teacher_subscriptions;
CREATE TRIGGER update_teacher_subscriptions_updated_at
    BEFORE UPDATE ON teacher_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_teacher_subscriptions_updated_at_column();
