-- Session attendance table for QR check-ins
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS session_attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occurred_on DATE NOT NULL, -- calendar date of the occurrence (UTC)
  checkin_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source VARCHAR(20) NOT NULL DEFAULT 'qr' CHECK (source IN ('qr','manual','system')),
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, student_id, occurred_on)
);

CREATE INDEX IF NOT EXISTS idx_session_attendance_student ON session_attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_session ON session_attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_course ON session_attendance(course_id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_teacher ON session_attendance(teacher_id);

-- trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_session_attendance_updated_at ON session_attendance;
CREATE TRIGGER update_session_attendance_updated_at
  BEFORE UPDATE ON session_attendance
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
