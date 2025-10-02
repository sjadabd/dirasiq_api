-- Exams and Exam Grades schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1) exams
CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  exam_date TIMESTAMPTZ NOT NULL,
  exam_type VARCHAR(20) NOT NULL CHECK (exam_type IN ('daily','monthly')),

  max_score INT NOT NULL,
  description TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) exam_grades
CREATE TABLE IF NOT EXISTS exam_grades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  score INT NOT NULL,
  graded_at TIMESTAMPTZ DEFAULT NOW(),
  graded_by UUID REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE (exam_id, student_id)
);
