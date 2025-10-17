-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- sessions: core lecture session unit (weekly recurrence by weekday + time)
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Sunday ... 6=Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  recurrence BOOLEAN NOT NULL DEFAULT true,

  -- flexibility window
  flex_type VARCHAR(20) NOT NULL DEFAULT 'window' CHECK (flex_type IN ('window','alternates','none')),
  flex_minutes SMALLINT CHECK (flex_minutes >= 0), -- used when flex_type='window'
  flex_alternates JSONB, -- array of { weekday: number, start_time: string, end_time: string }

  -- constraints
  hard_constraints JSONB, -- e.g., { room: 'A1', teacher_block: [...], campus: 'X' }
  soft_constraints JSONB, -- e.g., preferences

  -- state machine
  state VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft','proposed','conflict','confirmed','negotiating','rejected','canceled')),

  version INTEGER NOT NULL DEFAULT 1,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- attendees: explicit mapping of students to sessions (for group/1:many)
CREATE TABLE IF NOT EXISTS session_attendees (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, student_id)
);

-- conflicts: detected overlaps
CREATE TABLE IF NOT EXISTS session_conflicts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  other_session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  details JSONB
);

-- holds: soft hold during negotiation
CREATE TABLE IF NOT EXISTS session_holds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  hold_until TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- audit log for state transitions and negotiation steps
CREATE TABLE IF NOT EXISTS session_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  from_state VARCHAR(20),
  to_state VARCHAR(20),
  meta JSONB,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- indexes
CREATE INDEX IF NOT EXISTS idx_sessions_course ON sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_sessions_teacher ON sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_sessions_weekday_time ON sessions(weekday, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
CREATE INDEX IF NOT EXISTS idx_session_attendees_student ON session_attendees(student_id);
CREATE INDEX IF NOT EXISTS idx_session_conflicts_session ON session_conflicts(session_id);
CREATE INDEX IF NOT EXISTS idx_session_conflicts_student ON session_conflicts(student_id);

-- trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_sessions_updated_at ON sessions;
CREATE TRIGGER update_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
