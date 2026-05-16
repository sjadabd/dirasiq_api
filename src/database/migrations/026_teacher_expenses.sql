-- ============================================================================
-- 026_teacher_expenses.sql
-- ----------------------------------------------------------------------------
-- Teacher-recorded expenses (deducted from the teacher_wallet by application
-- logic). Soft-deleted.
--
-- Consolidates from v1:
--   - 031_create_teacher_expenses.sql
--
-- v2 corrections (vs v1):
--   - gen_random_uuid() (was uuid_generate_v4).
--   - DECIMAL(14,2) (was DECIMAL(12,2)).
--   - TIMESTAMPTZ already correct in v1 (expense_date stays DATE — correct).
--   - Adds composite (teacher_id, expense_date) for "expenses for teacher
--     in date range" queries.
--   - Adds partial index for soft-delete filter.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS teacher_expenses (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id   UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    study_year   VARCHAR(9),
    amount       DECIMAL(14,2) NOT NULL CHECK (amount >= 0),
    note         TEXT,
    expense_date DATE          NOT NULL DEFAULT CURRENT_DATE,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_teacher_expenses_teacher_id   ON teacher_expenses (teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_expenses_expense_date ON teacher_expenses (expense_date);

-- Hot path: "teacher X expenses in date range Y"
CREATE INDEX IF NOT EXISTS idx_teacher_expenses_alive
    ON teacher_expenses (teacher_id, expense_date DESC)
    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_teacher_expenses_updated_at ON teacher_expenses;
CREATE TRIGGER update_teacher_expenses_updated_at
    BEFORE UPDATE ON teacher_expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
