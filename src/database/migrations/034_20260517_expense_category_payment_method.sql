-- ============================================================================
-- 034_20260517_expense_category_payment_method.sql
-- ----------------------------------------------------------------------------
-- Adds `category` and `payment_method` to teacher_expenses. The dashboard
-- "manage expenses" page has had selects for both since day one, but the
-- backend silently dropped them on write. This migration closes the gap.
--
-- New constraints:
--   - category       VARCHAR(20)  CHECK (one of: salaries, rent, utilities,
--                                 maintenance, stationery, other)  DEFAULT 'other'
--   - payment_method VARCHAR(20)  CHECK (one of: cash, bank_transfer, card)
--                                 DEFAULT 'cash'
--
-- Backfill: existing rows get the defaults. The CHECK constraint is added
-- AFTER the backfill so no row violates it.
--
-- Idempotent:    yes  (column existence + constraint name checks)
-- Transactional: BEGIN/COMMIT inline. Runner does not start a transaction.
-- ============================================================================

BEGIN;

ALTER TABLE teacher_expenses
    ADD COLUMN IF NOT EXISTS category       VARCHAR(20) NOT NULL DEFAULT 'other';

ALTER TABLE teacher_expenses
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'cash';

-- Add CHECK constraints idempotently (name them so re-runs are no-ops).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'teacher_expenses_category_check'
    ) THEN
        ALTER TABLE teacher_expenses
            ADD CONSTRAINT teacher_expenses_category_check
            CHECK (category IN ('salaries','rent','utilities','maintenance','stationery','other'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'teacher_expenses_payment_method_check'
    ) THEN
        ALTER TABLE teacher_expenses
            ADD CONSTRAINT teacher_expenses_payment_method_check
            CHECK (payment_method IN ('cash','bank_transfer','card'));
    END IF;
END $$;

-- Filter index: "teacher X expenses by category in date range"
CREATE INDEX IF NOT EXISTS idx_teacher_expenses_category
    ON teacher_expenses (teacher_id, category, expense_date DESC)
    WHERE deleted_at IS NULL;

COMMIT;
