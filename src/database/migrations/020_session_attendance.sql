-- ============================================================================
-- 020_session_attendance.sql
-- ----------------------------------------------------------------------------
-- One row per (session, student, occurred_on) check-in. Unique on that tuple
-- so a student can't be checked in twice for the same occurrence.
--
-- Consolidates from v1:
--   - 021_create_session_attendance.sql
--
-- v2 corrections (vs v1):
--   - gen_random_uuid() (was uuid_generate_v4).
--   - TIMESTAMPTZ already correct in v1.
--   - Adds composite (course_id, occurred_on) index used by "today's
--     attendance for course" reports.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS session_attendance (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID         NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    course_id   UUID         NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
    teacher_id  UUID         NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    student_id  UUID         NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    occurred_on DATE         NOT NULL,
    checkin_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    source      VARCHAR(20)  NOT NULL DEFAULT 'qr'
                    CHECK (source IN ('qr','manual','system')),
    meta        JSONB,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    UNIQUE (session_id, student_id, occurred_on)
);

COMMENT ON COLUMN session_attendance.occurred_on IS 'Calendar date of the lecture occurrence (server local — Asia/Baghdad).';
COMMENT ON COLUMN session_attendance.source      IS 'How the check-in was recorded: qr | manual | system.';

CREATE INDEX IF NOT EXISTS idx_session_attendance_student ON session_attendance (student_id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_session ON session_attendance (session_id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_course  ON session_attendance (course_id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_teacher ON session_attendance (teacher_id);

-- Hot path: "attendance for course X on date D"
CREATE INDEX IF NOT EXISTS idx_session_attendance_course_date
    ON session_attendance (course_id, occurred_on DESC);

DROP TRIGGER IF EXISTS update_session_attendance_updated_at ON session_attendance;
CREATE TRIGGER update_session_attendance_updated_at
    BEFORE UPDATE ON session_attendance
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
