-- Update grades table to add missing columns
ALTER TABLE grades
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Update existing records to have is_active = true
UPDATE grades SET is_active = TRUE WHERE is_active IS NULL;

-- Add unique constraint on name if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_grade_name'
    ) THEN
        ALTER TABLE grades ADD CONSTRAINT unique_grade_name UNIQUE (name);
    END IF;
END $$;

-- Create index on is_active if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_grades_active ON grades(is_active);

-- Create index on deleted_at if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_grades_deleted_at ON grades(deleted_at);
