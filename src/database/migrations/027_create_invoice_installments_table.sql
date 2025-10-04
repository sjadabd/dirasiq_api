-- Create invoice_installments table
CREATE TABLE IF NOT EXISTS invoice_installments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES course_invoices(id) ON DELETE CASCADE,
    installment_number INT NOT NULL,
    planned_amount DECIMAL(12,2) NOT NULL CHECK (planned_amount > 0),
    paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    remaining_amount DECIMAL(12,2) GENERATED ALWAYS AS (GREATEST(planned_amount - paid_amount, 0)) STORED,
    installment_status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (installment_status IN ('pending','partial','paid','overdue')),
    due_date DATE NOT NULL,
    paid_date TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    UNIQUE (invoice_id, installment_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoice_installments_invoice_id ON invoice_installments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_installments_status ON invoice_installments(installment_status);
CREATE INDEX IF NOT EXISTS idx_invoice_installments_due_date ON invoice_installments(due_date);

-- Trigger to auto update updated_at
DROP TRIGGER IF EXISTS update_invoice_installments_updated_at ON invoice_installments;
CREATE TRIGGER update_invoice_installments_updated_at
    BEFORE UPDATE ON invoice_installments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
