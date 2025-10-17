-- جدول تسجيل استخدامات الحجوزات للتحليلات
CREATE TABLE IF NOT EXISTS booking_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ربط بالحجز
    booking_id UUID NOT NULL REFERENCES course_bookings(id) ON DELETE CASCADE,

    -- ربط بالمعلم والطالب
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- ربط بالاشتراك
    teacher_subscription_id UUID NOT NULL REFERENCES teacher_subscriptions(id) ON DELETE CASCADE,

    -- نوع العملية
    action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('approved', 'rejected', 'cancelled', 'reactivated')),

    -- الحالة السابقة والجديدة
    previous_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,

    -- عدد الطلاب قبل وبعد العملية
    students_before INTEGER NOT NULL DEFAULT 0,
    students_after INTEGER NOT NULL DEFAULT 0,

    -- معلومات إضافية
    reason TEXT,
    performed_by VARCHAR(20) NOT NULL CHECK (performed_by IN ('teacher', 'student', 'system')),

    -- التواريخ
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- فهارس للأداء
    CONSTRAINT idx_booking_usage_logs_booking_id UNIQUE (booking_id, action_type, created_at)
);

-- فهارس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_booking_usage_logs_teacher_id ON booking_usage_logs(teacher_id);
CREATE INDEX IF NOT EXISTS idx_booking_usage_logs_student_id ON booking_usage_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_booking_usage_logs_subscription_id ON booking_usage_logs(teacher_subscription_id);
CREATE INDEX IF NOT EXISTS idx_booking_usage_logs_action_type ON booking_usage_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_booking_usage_logs_created_at ON booking_usage_logs(created_at);

-- دالة لتسجيل استخدام الحجز
CREATE OR REPLACE FUNCTION log_booking_usage(
    p_booking_id UUID,
    p_teacher_id UUID,
    p_student_id UUID,
    p_teacher_subscription_id UUID,
    p_action_type VARCHAR(20),
    p_previous_status VARCHAR(20),
    p_new_status VARCHAR(20),
    p_students_before INTEGER,
    p_students_after INTEGER,
    p_reason TEXT DEFAULT NULL,
    p_performed_by VARCHAR(20) DEFAULT 'system'
) RETURNS UUID AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO booking_usage_logs (
        booking_id, teacher_id, student_id, teacher_subscription_id,
        action_type, previous_status, new_status,
        students_before, students_after, reason, performed_by
    ) VALUES (
        p_booking_id, p_teacher_id, p_student_id, p_teacher_subscription_id,
        p_action_type, p_previous_status, p_new_status,
        p_students_before, p_students_after, p_reason, p_performed_by
    ) RETURNING id INTO log_id;

    RETURN log_id;
END;
$$ LANGUAGE plpgsql;
