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

    -- 🆕 Reservation fields
    has_reservation BOOLEAN NOT NULL DEFAULT false,
    reservation_amount DECIMAL(10,2),

    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_courses_teacher_id ON courses(teacher_id);
CREATE INDEX IF NOT EXISTS idx_courses_grade_id ON courses(grade_id);
CREATE INDEX IF NOT EXISTS idx_courses_subject_id ON courses(subject_id);
CREATE INDEX IF NOT EXISTS idx_courses_study_year ON courses(study_year);
CREATE INDEX IF NOT EXISTS idx_courses_course_name ON courses(course_name);
CREATE INDEX IF NOT EXISTS idx_courses_is_deleted ON courses(is_deleted);

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_courses_updated_at ON courses;
CREATE TRIGGER update_courses_updated_at
    BEFORE UPDATE ON courses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Constraint: end_date must be after start_date
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_dates'
    ) THEN
        ALTER TABLE courses ADD CONSTRAINT check_dates CHECK (end_date > start_date);
    END IF;
END $$;

-- Unique: enforce one active (non-deleted) course per teacher/year/name/grade/subject
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class
        WHERE relname = 'idx_courses_unique_active_per_teacher_year_grade_subject'
    ) THEN
        CREATE UNIQUE INDEX idx_courses_unique_active_per_teacher_year_grade_subject
          ON courses (teacher_id, study_year, course_name, grade_id, subject_id)
          WHERE is_deleted = false;
    END IF;
END $$;

-- Constraint: reservation rules
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_courses_reservation_amount'
    ) THEN
        ALTER TABLE courses ADD CONSTRAINT chk_courses_reservation_amount
        CHECK (
            (has_reservation = false AND reservation_amount IS NULL)
            OR
            (has_reservation = true AND reservation_amount IS NOT NULL AND reservation_amount > 0 AND reservation_amount <= price)
        );
    END IF;
END $$;
