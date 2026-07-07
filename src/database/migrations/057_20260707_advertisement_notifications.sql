-- Migration: extend notifications.type for advertisement events
-- Created: 2026-07-07

BEGIN;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
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
        'booking_status',
        'advertisement_submitted',
        'advertisement_approved',
        'advertisement_rejected',
        'advertisement_budget_exhausted',
        'advertisement_finished'
    ));

COMMIT;
