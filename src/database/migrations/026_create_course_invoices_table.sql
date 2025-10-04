-- Create course_invoices table
CREATE TABLE IF NOT EXISTS course_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    study_year VARCHAR(9) NOT NULL,
    invoice_number VARCHAR UNIQUE,
    invoice_type VARCHAR(20) NOT NULL CHECK (invoice_type IN ('reservation','course','installment','penalty')),
    payment_mode VARCHAR(20) NOT NULL CHECK (payment_mode IN ('cash','installments')),
    amount_due DECIMAL(12,2) NOT NULL CHECK (amount_due >= 0),
    discount_total DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
    amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    remaining_amount DECIMAL(12,2) GENERATED ALWAYS AS (GREATEST(amount_due - discount_total - amount_paid, 0)) STORED,
    invoice_status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (invoice_status IN ('pending','partial','paid','overdue','cancelled')),
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    paid_date TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_course_invoices_teacher_id ON course_invoices(teacher_id);
CREATE INDEX IF NOT EXISTS idx_course_invoices_student_id ON course_invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_course_invoices_course_id ON course_invoices(course_id);
CREATE INDEX IF NOT EXISTS idx_course_invoices_study_year ON course_invoices(study_year);
CREATE INDEX IF NOT EXISTS idx_course_invoices_status ON course_invoices(invoice_status);
CREATE INDEX IF NOT EXISTS idx_course_invoices_due_date ON course_invoices(due_date);

-- Trigger to auto update updated_at
DROP TRIGGER IF EXISTS update_course_invoices_updated_at ON course_invoices;
CREATE TRIGGER update_course_invoices_updated_at
    BEFORE UPDATE ON course_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
