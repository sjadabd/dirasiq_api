-- Create teacher grades table
CREATE TABLE IF NOT EXISTS teacher_grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    grade_id UUID NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
    study_year VARCHAR(9) NOT NULL CHECK (study_year ~ '^[0-9]{4}-[0-9]{4}$'),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,

    -- Ensure unique combination of teacher, grade, and study year
    UNIQUE(teacher_id, grade_id, study_year)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_teacher_grades_teacher_id ON teacher_grades(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_grades_grade_id ON teacher_grades(grade_id);
CREATE INDEX IF NOT EXISTS idx_teacher_grades_study_year ON teacher_grades(study_year);
CREATE INDEX IF NOT EXISTS idx_teacher_grades_active ON teacher_grades(is_active);
CREATE INDEX IF NOT EXISTS idx_teacher_grades_created_at ON teacher_grades(created_at);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_teacher_grades_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_teacher_grades_updated_at ON teacher_grades;
CREATE TRIGGER update_teacher_grades_updated_at
    BEFORE UPDATE ON teacher_grades
    FOR EACH ROW
    EXECUTE FUNCTION update_teacher_grades_updated_at_column();
