-- Create teacher_expenses table
CREATE TABLE IF NOT EXISTS teacher_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  study_year VARCHAR(9),
  amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  note TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_teacher_expenses_teacher_id ON teacher_expenses(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_expenses_expense_date ON teacher_expenses(expense_date);

-- Trigger to auto update updated_at
DROP TRIGGER IF EXISTS update_teacher_expenses_updated_at ON teacher_expenses;
CREATE TRIGGER update_teacher_expenses_updated_at
    BEFORE UPDATE ON teacher_expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
