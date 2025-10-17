-- Create student grades table
CREATE TABLE IF NOT EXISTS student_grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    grade_id UUID NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
    study_year VARCHAR(9) NOT NULL CHECK (study_year ~ '^[0-9]{4}-[0-9]{4}$'),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,

    -- Ensure unique combination of student, grade, and study year
    UNIQUE(student_id, grade_id, study_year)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_student_grades_student_id ON student_grades(student_id);
CREATE INDEX IF NOT EXISTS idx_student_grades_grade_id ON student_grades(grade_id);
CREATE INDEX IF NOT EXISTS idx_student_grades_study_year ON student_grades(study_year);
CREATE INDEX IF NOT EXISTS idx_student_grades_active ON student_grades(is_active);
CREATE INDEX IF NOT EXISTS idx_student_grades_created_at ON student_grades(created_at);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_student_grades_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_student_grades_updated_at ON student_grades;
CREATE TRIGGER update_student_grades_updated_at
    BEFORE UPDATE ON student_grades
    FOR EACH ROW
    EXECUTE FUNCTION update_student_grades_updated_at_column();
