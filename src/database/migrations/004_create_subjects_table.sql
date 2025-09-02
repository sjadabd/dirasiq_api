-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create subjects table
CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on teacher_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_subjects_teacher_id ON subjects(teacher_id);

-- Create index on name field for faster searches
CREATE INDEX IF NOT EXISTS idx_subjects_name ON subjects(name);

-- Create trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS update_subjects_updated_at ON subjects;
CREATE TRIGGER update_subjects_updated_at
    BEFORE UPDATE ON subjects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add unique constraint to prevent duplicate subject names for the same teacher
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_subject_name_per_teacher'
    ) THEN
        ALTER TABLE subjects ADD CONSTRAINT unique_subject_name_per_teacher UNIQUE (teacher_id, name);
    END IF;
END $$;
