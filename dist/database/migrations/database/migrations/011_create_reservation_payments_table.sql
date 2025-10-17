-- Create reservation_payments table
CREATE TABLE IF NOT EXISTS reservation_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL UNIQUE REFERENCES course_bookings(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    status VARCHAR(10) NOT NULL CHECK (status IN ('pending', 'paid')) DEFAULT 'pending',
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Auto update updated_at
DROP TRIGGER IF EXISTS update_reservation_payments_updated_at ON reservation_payments;
CREATE TRIGGER update_reservation_payments_updated_at
    BEFORE UPDATE ON reservation_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_res_pay_teacher_id ON reservation_payments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_res_pay_course_id ON reservation_payments(course_id);
CREATE INDEX IF NOT EXISTS idx_res_pay_student_id ON reservation_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_res_pay_status ON reservation_payments(status);
