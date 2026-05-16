-- ============================================================================
-- 024_course_invoices.sql
-- ----------------------------------------------------------------------------
-- Per-student course invoice. Multiple types: reservation deposit, full
-- course fee, an installment plan, or a penalty.
--
-- Consolidates from v1:
--   - 026_create_course_invoices_table.sql  (the original schema — used DATE)
--   - 030_alter_invoice_dates_to_varchar.sql IS NOT APPLIED in v2 (the
--     date-columns-as-VARCHAR(10) change is reverted at the schema level —
--     see DATABASE_ANALYSIS.md §8 Critical finding #1).
--
-- v2 corrections (vs v1):
--   - gen_random_uuid() (was uuid_generate_v4).
--   - DECIMAL(14,2) (was DECIMAL(12,2)).
--   - **invoice_date, due_date are DATE** (was VARCHAR(10) post-030).
--   - **paid_date is TIMESTAMPTZ** (was VARCHAR(10) post-030; the original
--     migration 026 already had it as TIMESTAMPTZ).
--   - remaining_amount remains a STORED generated column.
--   - Adds composite (student_id, invoice_status) index for the student
--     "what do I owe" view.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS course_invoices (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID          NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    teacher_id      UUID          NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    course_id       UUID          NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    study_year      VARCHAR(9)    NOT NULL,
    invoice_number  VARCHAR       UNIQUE,
    invoice_type    VARCHAR(20)   NOT NULL
                        CHECK (invoice_type IN ('reservation','course','installment','penalty')),
    payment_mode    VARCHAR(20)   NOT NULL
                        CHECK (payment_mode IN ('cash','installments')),

    amount_due      DECIMAL(14,2) NOT NULL CHECK (amount_due     >= 0),
    discount_total  DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
    amount_paid     DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid    >= 0),

    -- Generated, always-up-to-date remaining. Cannot be set directly.
    remaining_amount DECIMAL(14,2)
        GENERATED ALWAYS AS (GREATEST(amount_due - discount_total - amount_paid, 0)) STORED,

    invoice_status  VARCHAR(10)   NOT NULL DEFAULT 'pending'
                        CHECK (invoice_status IN ('pending','partial','paid','overdue','cancelled')),

    -- Dates: DATE for date-only, TIMESTAMPTZ for paid_date (which has a moment).
    invoice_date    DATE          NOT NULL DEFAULT CURRENT_DATE,
    due_date        DATE,
    paid_date       TIMESTAMPTZ,

    notes           TEXT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

COMMENT ON COLUMN course_invoices.remaining_amount IS
    'STORED generated column = GREATEST(amount_due - discount_total - amount_paid, 0). Always read-only — application must not attempt to write it.';
COMMENT ON COLUMN course_invoices.paid_date        IS 'When the invoice was fully paid. Application sets it when remaining_amount drops to 0.';

CREATE INDEX IF NOT EXISTS idx_course_invoices_teacher_id  ON course_invoices (teacher_id);
CREATE INDEX IF NOT EXISTS idx_course_invoices_student_id  ON course_invoices (student_id);
CREATE INDEX IF NOT EXISTS idx_course_invoices_course_id   ON course_invoices (course_id);
CREATE INDEX IF NOT EXISTS idx_course_invoices_study_year  ON course_invoices (study_year);
CREATE INDEX IF NOT EXISTS idx_course_invoices_status      ON course_invoices (invoice_status);
CREATE INDEX IF NOT EXISTS idx_course_invoices_due_date    ON course_invoices (due_date);

-- Hot path: "what does student X still owe?"
CREATE INDEX IF NOT EXISTS idx_course_invoices_student_open
    ON course_invoices (student_id, due_date)
    WHERE deleted_at IS NULL AND invoice_status IN ('pending','partial','overdue');

DROP TRIGGER IF EXISTS update_course_invoices_updated_at ON course_invoices;
CREATE TRIGGER update_course_invoices_updated_at
    BEFORE UPDATE ON course_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
