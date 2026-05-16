-- ============================================================================
-- 013_reservation_payments.sql
-- ----------------------------------------------------------------------------
-- One reservation deposit per course_booking. Created when a teacher
-- pre-approves a booking that has has_reservation = TRUE on its course;
-- flipped to 'paid' by the Wayl webhook handler.
--
-- Consolidates from v1:
--   - 011_create_reservation_payments_table.sql
--
-- v2 corrections (vs v1):
--   - gen_random_uuid() (was uuid_generate_v4).
--   - DECIMAL(14,2) (was DECIMAL(10,2)).
--   - TIMESTAMPTZ already correct in v1.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS reservation_payments (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id  UUID          NOT NULL UNIQUE REFERENCES course_bookings(id) ON DELETE CASCADE,
    student_id  UUID          NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    teacher_id  UUID          NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    course_id   UUID          NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    amount      DECIMAL(14,2) NOT NULL CHECK (amount > 0),
    status      VARCHAR(10)   NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','paid')),
    paid_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON COLUMN reservation_payments.status  IS 'pending = link created and waiting; paid = Wayl webhook confirmed payment.';
COMMENT ON COLUMN reservation_payments.paid_at IS 'When the Wayl webhook flipped status to paid.';

CREATE INDEX IF NOT EXISTS idx_res_pay_teacher_id ON reservation_payments (teacher_id);
CREATE INDEX IF NOT EXISTS idx_res_pay_course_id  ON reservation_payments (course_id);
CREATE INDEX IF NOT EXISTS idx_res_pay_student_id ON reservation_payments (student_id);
CREATE INDEX IF NOT EXISTS idx_res_pay_status     ON reservation_payments (status);

DROP TRIGGER IF EXISTS update_reservation_payments_updated_at ON reservation_payments;
CREATE TRIGGER update_reservation_payments_updated_at
    BEFORE UPDATE ON reservation_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
