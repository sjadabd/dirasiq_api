-- ============================================================================
-- 012_course_bookings.sql
-- ----------------------------------------------------------------------------
-- Booking workflow between a student and a course. The status field is the
-- core state machine; cancelled_by / rejected_by record who triggered the
-- terminal transition; reactivated_at handles the "student cancels then
-- changes mind" flow.
--
-- Consolidates from v1:
--   - 010_create_course_bookings_table.sql
--
-- v2 corrections (vs v1):
--   - gen_random_uuid() (was uuid_generate_v4).
--   - TIMESTAMPTZ already correct in v1; normalised syntax.
--   - The duplicate ALTER TABLE … DROP / ADD CONSTRAINT … CHECK on status from
--     v1 (added during a status-enum expansion) is removed; the CHECK is
--     defined once, inline.
--   - UNIQUE constraint inlined; v1's DO $$ … $$ guard removed.
--   - Adds composite index (status, is_deleted, teacher_id) for the
--     "list pending teacher approvals" path.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS course_bookings (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    student_id          UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    course_id           UUID         NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    teacher_id          UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    study_year          VARCHAR(9)   NOT NULL,

    -- Workflow state
    status              VARCHAR(20)  NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','pre_approved','confirmed','approved','rejected','cancelled')),
    cancelled_by        VARCHAR(10)  CHECK (cancelled_by IN ('student','teacher')),
    rejected_by         VARCHAR(20)  CHECK (rejected_by  IN ('teacher','student')),
    reactivated_at      TIMESTAMPTZ,

    booking_date        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    approved_at         TIMESTAMPTZ,
    rejected_at         TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ,

    rejection_reason    TEXT,
    cancellation_reason TEXT,
    student_message     TEXT,
    teacher_response    TEXT,

    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- One booking per (student, course). Re-bookings require reactivation, not duplication.
    CONSTRAINT unique_student_course_booking UNIQUE (student_id, course_id)
);

COMMENT ON COLUMN course_bookings.status        IS 'State machine: pending → pre_approved → confirmed → approved. Terminal: rejected | cancelled. Cancelled bookings can be reactivated (sets reactivated_at and status back to pending).';
COMMENT ON COLUMN course_bookings.cancelled_by  IS 'Who initiated the cancellation: student or teacher.';
COMMENT ON COLUMN course_bookings.rejected_by   IS 'Who initiated the rejection: typically teacher; student possible on certain workflows.';
COMMENT ON COLUMN course_bookings.reactivated_at IS 'Timestamp when a cancelled booking was reactivated by the student.';

CREATE INDEX IF NOT EXISTS idx_course_bookings_student_id      ON course_bookings (student_id);
CREATE INDEX IF NOT EXISTS idx_course_bookings_course_id       ON course_bookings (course_id);
CREATE INDEX IF NOT EXISTS idx_course_bookings_teacher_id      ON course_bookings (teacher_id);
CREATE INDEX IF NOT EXISTS idx_course_bookings_study_year      ON course_bookings (study_year);
CREATE INDEX IF NOT EXISTS idx_course_bookings_status          ON course_bookings (status);
CREATE INDEX IF NOT EXISTS idx_course_bookings_booking_date    ON course_bookings (booking_date);
CREATE INDEX IF NOT EXISTS idx_course_bookings_is_deleted      ON course_bookings (is_deleted);
CREATE INDEX IF NOT EXISTS idx_course_bookings_cancelled_by    ON course_bookings (cancelled_by);
CREATE INDEX IF NOT EXISTS idx_course_bookings_rejected_by     ON course_bookings (rejected_by);
CREATE INDEX IF NOT EXISTS idx_course_bookings_reactivated_at  ON course_bookings (reactivated_at);

-- Composite covering the "teacher approval inbox" query: pending bookings for a teacher.
CREATE INDEX IF NOT EXISTS idx_course_bookings_pending_inbox
    ON course_bookings (teacher_id, status, booking_date DESC)
    WHERE is_deleted = FALSE AND status IN ('pending', 'pre_approved');

DROP TRIGGER IF EXISTS update_course_bookings_updated_at ON course_bookings;
CREATE TRIGGER update_course_bookings_updated_at
    BEFORE UPDATE ON course_bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
