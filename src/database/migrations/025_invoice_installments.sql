-- ============================================================================
-- 025_invoice_installments.sql
-- ----------------------------------------------------------------------------
-- Installment plan rows for a course_invoice with payment_mode='installments'.
-- One row per scheduled payment.
--
-- Consolidates from v1:
--   - 027_create_invoice_installments_table.sql  (the original — DATE/TIMESTAMPTZ)
--   - 030_alter_invoice_dates_to_varchar.sql IS NOT APPLIED in v2 (reverted).
--
-- v2 corrections (vs v1):
--   - gen_random_uuid() (was uuid_generate_v4).
--   - DECIMAL(14,2) (was DECIMAL(12,2)).
--   - **due_date is DATE** (was VARCHAR(10) post-030).
--   - **paid_date is TIMESTAMPTZ** (was VARCHAR(10) post-030).
--   - paid_amount has CHECK (>= 0).
--   - Adds composite (invoice_id, installment_number) — already covered by
--     the UNIQUE, but the UNIQUE index serves the lookup. No extra index.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoice_installments (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id         UUID          NOT NULL REFERENCES course_invoices(id) ON DELETE CASCADE,
    installment_number INTEGER       NOT NULL CHECK (installment_number > 0),

    planned_amount     DECIMAL(14,2) NOT NULL CHECK (planned_amount > 0),
    paid_amount        DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),

    remaining_amount   DECIMAL(14,2)
        GENERATED ALWAYS AS (GREATEST(planned_amount - paid_amount, 0)) STORED,

    installment_status VARCHAR(10)   NOT NULL DEFAULT 'pending'
                            CHECK (installment_status IN ('pending','partial','paid','overdue')),

    due_date           DATE          NOT NULL,
    paid_date          TIMESTAMPTZ,

    notes              TEXT,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ,

    UNIQUE (invoice_id, installment_number)
);

COMMENT ON COLUMN invoice_installments.remaining_amount IS
    'STORED generated column = GREATEST(planned_amount - paid_amount, 0). Read-only.';

CREATE INDEX IF NOT EXISTS idx_invoice_installments_invoice_id ON invoice_installments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_installments_status     ON invoice_installments (installment_status);
CREATE INDEX IF NOT EXISTS idx_invoice_installments_due_date   ON invoice_installments (due_date);

DROP TRIGGER IF EXISTS update_invoice_installments_updated_at ON invoice_installments;
CREATE TRIGGER update_invoice_installments_updated_at
    BEFORE UPDATE ON invoice_installments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
