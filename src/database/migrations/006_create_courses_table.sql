-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create courses table
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    study_year VARCHAR(9) NOT NULL CHECK (study_year ~ '^\d{4}-\d{4}$'),
    grade_id UUID NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    course_name VARCHAR(255) NOT NULL,
    course_images TEXT[], -- Array of image paths
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    seats_count INTEGER NOT NULL CHECK (seats_count > 0),
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on teacher_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_courses_teacher_id ON courses(teacher_id);

-- Create index on grade_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_courses_grade_id ON courses(grade_id);

-- Create index on subject_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_courses_subject_id ON courses(subject_id);

-- Create index on study_year for faster filtering
CREATE INDEX IF NOT EXISTS idx_courses_study_year ON courses(study_year);

-- Create index on course_name for faster searches
CREATE INDEX IF NOT EXISTS idx_courses_course_name ON courses(course_name);

-- Create index on is_deleted for soft delete filtering
CREATE INDEX IF NOT EXISTS idx_courses_is_deleted ON courses(is_deleted);

-- Create trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS update_courses_updated_at ON courses;
CREATE TRIGGER update_courses_updated_at
    BEFORE UPDATE ON courses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add constraint to ensure end_date is after start_date
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_dates'
    ) THEN
        ALTER TABLE courses ADD CONSTRAINT check_dates CHECK (end_date > start_date);
    END IF;
END $$;

-- Add unique constraint to prevent duplicate course names for the same teacher in the same year
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_course_name_per_teacher_year'
    ) THEN
        ALTER TABLE courses ADD CONSTRAINT unique_course_name_per_teacher_year UNIQUE (teacher_id, study_year, course_name);
    END IF;
END $$;
