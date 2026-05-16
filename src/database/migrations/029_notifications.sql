-- ============================================================================
-- 029_notifications.sql
-- ----------------------------------------------------------------------------
-- Three related tables together:
--   - notifications          — the notification record (broadcast or targeted)
--   - user_notifications     — per-user read state
--   - notification_templates — reusable parameterised templates
--
-- Consolidates from v1:
--   - 013_create_notifications_tables.sql  (the canonical version)
--   - notifications.sql                    (near-duplicate; absorbed)
--
-- v2 corrections (vs v1):
--   - TIMESTAMPTZ everywhere (already correct in v1 — normalised syntax).
--   - The per-table `update_notifications_updated_at()` function is REMOVED;
--     the shared `update_updated_at_column()` from 001 is used.
--   - Adds **FK from notifications.deleted_by → users.id ON DELETE SET NULL**
--     (v1 declared the column but no FK).
--   - The legacy DML `UPDATE notifications SET study_year = ...` backfill
--     (relevant only to v1's mid-history `data->>'studyYear'` migration) is
--     REMOVED from v2. Fresh installs start clean.
--   - Adds partial index on `user_notifications` for the "my unread"
--     listing.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(255) NOT NULL,
    message         TEXT         NOT NULL,

    type            VARCHAR(50)  NOT NULL CHECK (type IN (
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
    priority        VARCHAR(20)  NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('low','medium','high','urgent')),
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','sent','delivered','read','failed')),
    recipient_type  VARCHAR(50)  NOT NULL CHECK (recipient_type IN (
        'all','teachers','students','specific_teachers','specific_students','parents'
    )),
    recipient_ids   JSONB,
    data            JSONB,
    study_year      VARCHAR(50),

    scheduled_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    sent_at         TIMESTAMPTZ,
    read_at         TIMESTAMPTZ,

    created_by      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- Soft delete
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID         REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON COLUMN notifications.recipient_ids IS 'JSONB array of user UUIDs. Used when recipient_type is one of the "specific_*" values.';
COMMENT ON COLUMN notifications.data          IS 'Free-form payload sent to the client (e.g. { "route": "/assignment-details", "assignment_id": "…" }).';
COMMENT ON COLUMN notifications.study_year    IS 'Optional academic-year scope for filtering. Format: YYYY-YYYY.';

CREATE INDEX IF NOT EXISTS idx_notifications_type           ON notifications (type);
CREATE INDEX IF NOT EXISTS idx_notifications_status         ON notifications (status);
CREATE INDEX IF NOT EXISTS idx_notifications_priority       ON notifications (priority);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_type ON notifications (recipient_type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_by     ON notifications (created_by);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled_at   ON notifications (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at     ON notifications (created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_ids  ON notifications USING GIN (recipient_ids);
CREATE INDEX IF NOT EXISTS idx_notifications_study_year     ON notifications (study_year);
CREATE INDEX IF NOT EXISTS idx_notifications_not_deleted
    ON notifications (deleted_at) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trigger_update_notifications_updated_at ON notifications;
CREATE TRIGGER trigger_update_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- user_notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_notifications (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID         NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
    notification_id UUID         NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    UNIQUE (user_id, notification_id)
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id         ON user_notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_notification_id ON user_notifications (notification_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_read_at         ON user_notifications (read_at);

-- Hot path: "my unread notifications"
CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
    ON user_notifications (user_id, created_at DESC)
    WHERE read_at IS NULL;

-- ---------------------------------------------------------------------------
-- notification_templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_templates (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name             VARCHAR(100) NOT NULL UNIQUE,
    title_template   TEXT         NOT NULL,
    message_template TEXT         NOT NULL,
    type             VARCHAR(50)  NOT NULL,
    priority         VARCHAR(20)  NOT NULL DEFAULT 'medium',
    variables        JSONB,
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_by       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON COLUMN notification_templates.variables IS
    'JSONB describing template variables and their semantics, e.g. { "studentName": "string", "courseTitle": "string" }.';

CREATE INDEX IF NOT EXISTS idx_notification_templates_type       ON notification_templates (type);
CREATE INDEX IF NOT EXISTS idx_notification_templates_is_active  ON notification_templates (is_active);
CREATE INDEX IF NOT EXISTS idx_notification_templates_created_by ON notification_templates (created_by);

DROP TRIGGER IF EXISTS trigger_update_notification_templates_updated_at ON notification_templates;
CREATE TRIGGER trigger_update_notification_templates_updated_at
    BEFORE UPDATE ON notification_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
