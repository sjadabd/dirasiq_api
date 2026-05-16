-- ============================================================================
-- 018_booking_usage_logs.sql
-- ----------------------------------------------------------------------------
-- Append-only audit log of booking state transitions. Each row records who
-- changed what, the previous → new status, and the resulting student count
-- delta for the relevant subscription.
--
-- The helper function `log_booking_usage(...)` is defined here. Application
-- code calls it whenever a booking transitions. (It is NOT a trigger —
-- triggers can't see the subscription_id context the app must supply.)
--
-- Consolidates from v1:
--   - 012_create_booking_usage_logs_table.sql
--
-- v2 corrections (vs v1):
--   - TIMESTAMPTZ.
--   - The misleading UNIQUE constraint named `idx_booking_usage_logs_booking_id`
--     (it's actually on the 3-tuple (booking_id, action_type, created_at)) is
--     renamed to a more descriptive `unique_booking_usage_event`.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS booking_usage_logs (
    id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    booking_id              UUID         NOT NULL REFERENCES course_bookings(id)        ON DELETE CASCADE,
    teacher_id              UUID         NOT NULL REFERENCES users(id)                  ON DELETE CASCADE,
    student_id              UUID         NOT NULL REFERENCES users(id)                  ON DELETE CASCADE,
    teacher_subscription_id UUID         NOT NULL REFERENCES teacher_subscriptions(id)  ON DELETE CASCADE,

    action_type             VARCHAR(20)  NOT NULL
        CHECK (action_type IN ('approved','rejected','cancelled','reactivated')),

    previous_status         VARCHAR(20),
    new_status              VARCHAR(20)  NOT NULL,

    students_before         INTEGER      NOT NULL DEFAULT 0,
    students_after          INTEGER      NOT NULL DEFAULT 0,

    reason                  TEXT,
    performed_by            VARCHAR(20)  NOT NULL
        CHECK (performed_by IN ('teacher','student','system')),

    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT unique_booking_usage_event UNIQUE (booking_id, action_type, created_at)
);

COMMENT ON TABLE booking_usage_logs IS
    'Append-only audit log of booking state transitions. Never UPDATE or DELETE rows here.';

CREATE INDEX IF NOT EXISTS idx_booking_usage_logs_teacher_id      ON booking_usage_logs (teacher_id);
CREATE INDEX IF NOT EXISTS idx_booking_usage_logs_student_id      ON booking_usage_logs (student_id);
CREATE INDEX IF NOT EXISTS idx_booking_usage_logs_subscription_id ON booking_usage_logs (teacher_subscription_id);
CREATE INDEX IF NOT EXISTS idx_booking_usage_logs_action_type     ON booking_usage_logs (action_type);
CREATE INDEX IF NOT EXISTS idx_booking_usage_logs_created_at      ON booking_usage_logs (created_at);

-- Hot path: "timeline of a specific booking"
CREATE INDEX IF NOT EXISTS idx_booking_usage_logs_per_booking
    ON booking_usage_logs (booking_id, created_at);

-- ---------------------------------------------------------------------------
-- Helper: insert one audit row. Called from application code wherever a
-- booking status changes. Returns the new log row id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_booking_usage(
    p_booking_id              UUID,
    p_teacher_id              UUID,
    p_student_id              UUID,
    p_teacher_subscription_id UUID,
    p_action_type             VARCHAR(20),
    p_previous_status         VARCHAR(20),
    p_new_status              VARCHAR(20),
    p_students_before         INTEGER,
    p_students_after          INTEGER,
    p_reason                  TEXT     DEFAULT NULL,
    p_performed_by            VARCHAR(20) DEFAULT 'system'
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
    )
    RETURNING id INTO log_id;

    RETURN log_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_booking_usage IS
    'Insert one append-only audit row. Called by the application on every booking status transition.';
