-- ============================================================================
-- 015_teacher_student_capacity.sql
-- ----------------------------------------------------------------------------
-- Per-teacher aggregate of currently-confirmed students, decoupled from any
-- single subscription. Introduced in v1 migration 039 to support multiple
-- simultaneous subscriptions per teacher.
--
-- Consolidates from v1:
--   - 039_support_multiple_active_subscriptions_and_teacher_capacity.sql
--     (the new-table portion only)
--
-- v2 corrections (vs v1):
--   - TIMESTAMPTZ.
--   - Uses shared `update_updated_at_column()`; per-table function removed.
--   - DML backfill (INSERT … FROM teacher_subscriptions) is REMOVED. The
--     cutover script handles backfill for existing prod data.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS teacher_student_capacity (
    teacher_id       UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_students INTEGER     NOT NULL DEFAULT 0
                         CHECK (current_students >= 0),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE teacher_student_capacity IS
    'Aggregate "approved students" counter per teacher, independent of subscription rows. Application code maintains it on booking approve/reject/cancel.';

DROP TRIGGER IF EXISTS update_teacher_student_capacity_updated_at ON teacher_student_capacity;
CREATE TRIGGER update_teacher_student_capacity_updated_at
    BEFORE UPDATE ON teacher_student_capacity
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
