-- ============================================================================
-- 014_teacher_subscriptions.sql
-- ----------------------------------------------------------------------------
-- A teacher's purchase of a subscription tier (subscription_package). A
-- teacher may have multiple active subscriptions simultaneously (e.g. a base
-- tier plus an add-on). Total capacity is tracked separately in
-- teacher_student_capacity (file 015).
--
-- Consolidates from v1:
--   - 011_create_teacher_subscriptions_table.sql  (base table)
--   - 038_fix_teacher_subscriptions_unique_active.sql  (dropped a broken
--     UNIQUE constraint)
--   - 039_support_multiple_active_subscriptions_and_teacher_capacity.sql
--     (the teacher_subscriptions part — dropped the partial unique index)
--
-- v2 corrections (vs v1):
--   - The original UNIQUE (teacher_id, is_active) constraint (logically broken)
--     is NOT recreated.
--   - The partial UNIQUE that briefly enforced "one active subscription per
--     teacher" is NOT recreated either (per migration 039, multiple actives
--     are allowed).
--   - TIMESTAMPTZ everywhere.
--   - Uses shared `update_updated_at_column()`.
--   - DML backfill of current_students from course_bookings (present in v1)
--     is REMOVED here. v2 fresh installs have no data. The cutover script
--     handles backfill for existing prod data.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS teacher_subscriptions (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id               UUID        NOT NULL REFERENCES users(id)                 ON DELETE CASCADE,
    subscription_package_id  UUID        NOT NULL REFERENCES subscription_packages(id) ON DELETE CASCADE,

    start_date               TIMESTAMPTZ NOT NULL,
    end_date                 TIMESTAMPTZ NOT NULL,

    is_active                BOOLEAN     NOT NULL DEFAULT TRUE,

    -- Per-subscription counter. Kept in sync by application code on booking
    -- approve/reject/cancel. See also teacher_student_capacity (015) for the
    -- teacher-wide aggregate.
    current_students         INTEGER     NOT NULL DEFAULT 0
                                 CHECK (current_students >= 0),

    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at               TIMESTAMPTZ,

    CONSTRAINT check_end_after_start CHECK (end_date > start_date)
);

COMMENT ON TABLE teacher_subscriptions IS
    'A teacher''s active or historical subscriptions. Multiple active rows per teacher are intentionally allowed (after migration 039 in v1). Capacity aggregation lives in teacher_student_capacity.';

COMMENT ON COLUMN teacher_subscriptions.is_active        IS 'Whether the subscription is currently effective. Today this can be TRUE on more than one row per teacher (decision in v1 migration 039).';
COMMENT ON COLUMN teacher_subscriptions.current_students IS 'Per-subscription tally of approved students. Source of truth for aggregate capacity is teacher_student_capacity.';

CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_teacher_id        ON teacher_subscriptions (teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_package_id        ON teacher_subscriptions (subscription_package_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_active            ON teacher_subscriptions (is_active);
CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_current_students  ON teacher_subscriptions (current_students);

-- Hot path: "find the teacher's active, non-deleted subscriptions"
CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_active_per_teacher
    ON teacher_subscriptions (teacher_id, end_date DESC)
    WHERE is_active = TRUE AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_teacher_subscriptions_updated_at ON teacher_subscriptions;
CREATE TRIGGER update_teacher_subscriptions_updated_at
    BEFORE UPDATE ON teacher_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
