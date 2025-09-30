BEGIN;

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN (
        'homework_reminder',
        'course_update',
        'booking_confirmation',
        'booking_cancellation',
        'new_booking',
        'payment_reminder',
        'system_announcement',
        'grade_update',
        'assignment_due',
        'class_reminder',
        'teacher_message',
        'parent_notification',
        'subscription_expiry',
        'new_course_available',
        'course_completion',
        'feedback_request',
        'booking_status'
    )),
    priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    recipient_type VARCHAR(50) NOT NULL CHECK (recipient_type IN (
        'all',
        'teachers',
        'students',
        'specific_teachers',
        'specific_students',
        'parents'
    )),
    recipient_ids JSONB, -- Array of user IDs for specific recipients
    data JSONB,          -- Additional data for the notification
    study_year VARCHAR(50), -- added via migration 015
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL, -- soft delete
    deleted_by UUID NULL         -- soft delete
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_type ON notifications(recipient_type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_by ON notifications(created_by);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled_at ON notifications(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_ids ON notifications USING GIN (recipient_ids);
CREATE INDEX IF NOT EXISTS idx_notifications_study_year ON notifications(study_year);
CREATE INDEX IF NOT EXISTS idx_notifications_not_deleted ON notifications (deleted_at) WHERE deleted_at IS NULL;

-- Backfill study_year from JSON data if present
UPDATE notifications
SET study_year = COALESCE(study_year, data->>'studyYear')
WHERE study_year IS NULL;

-- Create user_notifications table to track read status per user
CREATE TABLE IF NOT EXISTS user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, notification_id)
);

-- Indexes for user_notifications
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_notification_id ON user_notifications(notification_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_read_at ON user_notifications(read_at);

-- Create notification_templates table
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    title_template TEXT NOT NULL,
    message_template TEXT NOT NULL,
    type VARCHAR(50) NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    variables JSONB,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for notification_templates
CREATE INDEX IF NOT EXISTS idx_notification_templates_type ON notification_templates(type);
CREATE INDEX IF NOT EXISTS idx_notification_templates_is_active ON notification_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_notification_templates_created_by ON notification_templates(created_by);

-- Insert default notification templates (including new_booking)
INSERT INTO notification_templates (name, title_template, message_template, type, priority, variables, created_by) VALUES
('homework_reminder', 'تنبيه واجب منزلي - {{course_name}}', 'لديك واجب منزلي جديد في مادة {{subject_name}} من المعلم {{teacher_name}}. الموعد النهائي: {{due_date}}', 'homework_reminder', 'high', '{"course_name": "اسم الدورة", "subject_name": "اسم المادة", "teacher_name": "اسم المعلم", "due_date": "تاريخ الاستحقاق"}', (SELECT id FROM users WHERE user_type = 'super_admin' LIMIT 1)),
('new_booking', 'حجز جديد - {{course_name}}', 'لديك حجز جديد من الطالب {{student_name}} في دورة {{course_name}}. {{student_message}}', 'new_booking', 'high', '{"course_name": "اسم الدورة", "student_name": "اسم الطالب", "student_message": "رسالة الطالب"}', (SELECT id FROM users WHERE user_type = 'super_admin' LIMIT 1)),
('course_update', 'تحديث في الدورة - {{course_name}}', 'تم تحديث الدورة {{course_name}} من قبل المعلم {{teacher_name}}. {{update_message}}', 'course_update', 'medium', '{"course_name": "اسم الدورة", "teacher_name": "اسم المعلم", "update_message": "رسالة التحديث"}', (SELECT id FROM users WHERE user_type = 'super_admin' LIMIT 1)),
('booking_confirmation', 'تأكيد حجز - {{course_name}}', 'تم تأكيد حجزك في الدورة {{course_name}} مع المعلم {{teacher_name}}. موعد الحصة: {{booking_date}}', 'booking_confirmation', 'medium', '{"course_name": "اسم الدورة", "teacher_name": "اسم المعلم", "booking_date": "تاريخ الحصة"}', (SELECT id FROM users WHERE user_type = 'super_admin' LIMIT 1)),
('payment_reminder', 'تذكير بالدفع - {{course_name}}', 'تذكير: يرجى دفع رسوم الدورة {{course_name}} قبل {{due_date}} لتجنب إلغاء الحجز', 'payment_reminder', 'high', '{"course_name": "اسم الدورة", "due_date": "تاريخ الاستحقاق"}', (SELECT id FROM users WHERE user_type = 'super_admin' LIMIT 1)),
('system_announcement', 'إعلان نظام - {{title}}', '{{message}}', 'system_announcement', 'medium', '{"title": "عنوان الإعلان", "message": "محتوى الإعلان"}', (SELECT id FROM users WHERE user_type = 'super_admin' LIMIT 1)),
('grade_update', 'تحديث الدرجات - {{course_name}}', 'تم تحديث درجاتك في مادة {{subject_name}} من الدورة {{course_name}}. الدرجة الجديدة: {{grade}}', 'grade_update', 'medium', '{"course_name": "اسم الدورة", "subject_name": "اسم المادة", "grade": "الدرجة"}', (SELECT id FROM users WHERE user_type = 'super_admin' LIMIT 1)),
('assignment_due', 'واجب مستحق قريباً - {{assignment_name}}', 'الواجب {{assignment_name}} في مادة {{subject_name}} مستحق خلال {{time_remaining}}', 'assignment_due', 'high', '{"assignment_name": "اسم الواجب", "subject_name": "اسم المادة", "time_remaining": "الوقت المتبقي"}', (SELECT id FROM users WHERE user_type = 'super_admin' LIMIT 1)),
('class_reminder', 'تذكير بالحصة - {{course_name}}', 'تذكير: حصة {{course_name}} مع المعلم {{teacher_name}} ستبدأ خلال {{time_remaining}}', 'class_reminder', 'medium', '{"course_name": "اسم الدورة", "teacher_name": "اسم المعلم", "time_remaining": "الوقت المتبقي"}', (SELECT id FROM users WHERE user_type = 'super_admin' LIMIT 1)),
('subscription_expiry', 'انتهاء الاشتراك قريباً', 'اشتراكك في المنصة سينتهي خلال {{days_remaining}} أيام. يرجى تجديد الاشتراك للاستمرار في الاستفادة من الخدمات', 'subscription_expiry', 'high', '{"days_remaining": "عدد الأيام المتبقية"}', (SELECT id FROM users WHERE user_type = 'super_admin' LIMIT 1)),
('new_course_available', 'دورة جديدة متاحة - {{course_name}}', 'دورة جديدة متاحة: {{course_name}} مع المعلم {{teacher_name}}. {{course_description}}', 'new_course_available', 'low', '{"course_name": "اسم الدورة", "teacher_name": "اسم المعلم", "course_description": "وصف الدورة"}', (SELECT id FROM users WHERE user_type = 'super_admin' LIMIT 1))
ON CONFLICT (name) DO NOTHING;

-- Create function & triggers to auto-update updated_at
CREATE OR REPLACE FUNCTION update_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_notifications_updated_at ON notifications;
CREATE TRIGGER trigger_update_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_notifications_updated_at();

DROP TRIGGER IF EXISTS trigger_update_notification_templates_updated_at ON notification_templates;
CREATE TRIGGER trigger_update_notification_templates_updated_at
    BEFORE UPDATE ON notification_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_notifications_updated_at();

COMMIT;
