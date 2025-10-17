-- Create student evaluations table
CREATE TABLE IF NOT EXISTS student_evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  eval_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- store date portion for uniqueness per day
  eval_date_date DATE NOT NULL DEFAULT CURRENT_DATE,

  scientific_level VARCHAR(20) NOT NULL CHECK (scientific_level IN ('excellent','very_good','good','fair','weak')),
  behavioral_level VARCHAR(20) NOT NULL CHECK (behavioral_level IN ('excellent','very_good','good','fair','weak')),
  attendance_level VARCHAR(20) NOT NULL CHECK (attendance_level IN ('excellent','very_good','good','fair','weak')),
  homework_preparation VARCHAR(20) NOT NULL CHECK (homework_preparation IN ('excellent','very_good','good','fair','weak')),
  participation_level VARCHAR(20) NOT NULL CHECK (participation_level IN ('excellent','very_good','good','fair','weak')),
  instruction_following VARCHAR(20) NOT NULL CHECK (instruction_following IN ('excellent','very_good','good','fair','weak')),

  guidance TEXT NULL,
  notes TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uniqueness per student/teacher/day
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_evaluations_unique_per_day'
  ) THEN
    ALTER TABLE student_evaluations
      ADD CONSTRAINT student_evaluations_unique_per_day UNIQUE (student_id, teacher_id, eval_date_date);
  END IF;
END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_student_evaluations_student ON student_evaluations(student_id);
CREATE INDEX IF NOT EXISTS idx_student_evaluations_teacher ON student_evaluations(teacher_id);
CREATE INDEX IF NOT EXISTS idx_student_evaluations_date ON student_evaluations(eval_date_date);
