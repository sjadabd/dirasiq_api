-- Create invoice_entries table
CREATE TABLE IF NOT EXISTS invoice_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES course_invoices(id) ON DELETE CASCADE,
    entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('payment','discount','refund','adjustment')),
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    installment_id UUID REFERENCES invoice_installments(id) ON DELETE SET NULL,
    payment_method VARCHAR(20) CHECK (payment_method IN ('cash','bank_transfer','credit_card','mobile_payment')),
    installment_status VARCHAR(10) CHECK (installment_status IN ('pending','partial','paid','overdue')),
    paid_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoice_entries_invoice_id ON invoice_entries(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_entries_entry_type ON invoice_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_invoice_entries_paid_at ON invoice_entries(paid_at);

-- Trigger to auto update updated_at
DROP TRIGGER IF EXISTS update_invoice_entries_updated_at ON invoice_entries;
CREATE TRIGGER update_invoice_entries_updated_at
    BEFORE UPDATE ON invoice_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
