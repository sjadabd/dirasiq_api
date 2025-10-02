-- 1) Create exams table if missing (excludes session_id)
CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  exam_date TIMESTAMPTZ NOT NULL,
  exam_type VARCHAR(20) NOT NULL CHECK (exam_type IN ('daily','monthly')),

  max_score INT NOT NULL,
  description TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If a legacy column session_id exists, drop it safely
ALTER TABLE exams DROP COLUMN IF EXISTS session_id;

-- 2) Mapping table: exam_sessions (exam <-> session)
CREATE TABLE IF NOT EXISTS exam_sessions (
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  PRIMARY KEY (exam_id, session_id)
);

-- 3) Grades table (create if missing)
CREATE TABLE IF NOT EXISTS exam_grades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INT NOT NULL,
  graded_at TIMESTAMPTZ DEFAULT NOW(),
  graded_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Ensure uniqueness per (exam_id, student_id) via unique index
CREATE UNIQUE INDEX IF NOT EXISTS exam_grades_exam_id_student_id_key
  ON exam_grades(exam_id, student_id);
