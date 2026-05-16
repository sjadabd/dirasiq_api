-- ============================================================================
-- 019_sessions.sql
-- ----------------------------------------------------------------------------
-- Weekly recurring lecture sessions with a negotiation workflow.
-- Owns 5 related tables created together:
--   - sessions             — the session itself, with state machine
--   - session_attendees    — explicit student ↔ session mapping
--   - session_conflicts    — detected overlaps per student
--   - session_holds        — soft holds during negotiation
--   - session_audit        — append-only log of state transitions
--
-- Consolidates from v1:
--   - 020_create_lecture_scheduling.sql
--
-- v2 corrections (vs v1):
--   - gen_random_uuid() (was uuid_generate_v4).
--   - TIMESTAMPTZ already correct in v1.
--   - Adds `idx_sessions_alive` partial index for the hot "active sessions"
--     query.
--   - Adds CHECK on `end_time > start_time` (the v1 schema did not enforce
--     this — a 09:00–08:00 session was structurally legal).
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id        UUID         NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    teacher_id       UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    title            TEXT,

    -- Weekly recurrence
    weekday          SMALLINT     NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time       TIME         NOT NULL,
    end_time         TIME         NOT NULL,
    recurrence       BOOLEAN      NOT NULL DEFAULT TRUE,

    -- Flexibility (the teacher tolerates some movement)
    flex_type        VARCHAR(20)  NOT NULL DEFAULT 'window'
                         CHECK (flex_type IN ('window','alternates','none')),
    flex_minutes     SMALLINT     CHECK (flex_minutes >= 0),
    flex_alternates  JSONB,

    -- Free-form constraints
    hard_constraints JSONB,
    soft_constraints JSONB,

    -- Workflow
    state            VARCHAR(20)  NOT NULL DEFAULT 'draft'
                         CHECK (state IN ('draft','proposed','conflict','confirmed','negotiating','rejected','canceled')),

    version          INTEGER      NOT NULL DEFAULT 1,
    is_deleted       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT sessions_time_window CHECK (end_time > start_time)
);

COMMENT ON COLUMN sessions.weekday         IS '0 = Sunday … 6 = Saturday.';
COMMENT ON COLUMN sessions.flex_type       IS 'How rigid the time slot is: window (± flex_minutes), alternates (use flex_alternates), or none.';
COMMENT ON COLUMN sessions.flex_alternates IS 'JSON array: [{ "weekday": int, "start_time": "HH:MM", "end_time": "HH:MM" }, …]';
COMMENT ON COLUMN sessions.state           IS 'draft → proposed → confirmed (happy path). conflict / negotiating / rejected / canceled are branch states.';

CREATE INDEX IF NOT EXISTS idx_sessions_course        ON sessions (course_id);
CREATE INDEX IF NOT EXISTS idx_sessions_teacher       ON sessions (teacher_id);
CREATE INDEX IF NOT EXISTS idx_sessions_weekday_time  ON sessions (weekday, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_sessions_state         ON sessions (state);

CREATE INDEX IF NOT EXISTS idx_sessions_alive
    ON sessions (course_id, weekday, start_time)
    WHERE is_deleted = FALSE AND state IN ('proposed','confirmed','negotiating');

DROP TRIGGER IF EXISTS update_sessions_updated_at ON sessions;
CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- session_attendees
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_attendees (
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    PRIMARY KEY (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_session_attendees_student ON session_attendees (student_id);

-- ---------------------------------------------------------------------------
-- session_conflicts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_conflicts (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id       UUID         NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    other_session_id UUID         NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    student_id       UUID         NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    status           VARCHAR(20)  NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','resolved','dismissed')),
    detected_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    resolved_at      TIMESTAMPTZ,
    details          JSONB
);

CREATE INDEX IF NOT EXISTS idx_session_conflicts_session ON session_conflicts (session_id);
CREATE INDEX IF NOT EXISTS idx_session_conflicts_student ON session_conflicts (student_id);

-- ---------------------------------------------------------------------------
-- session_holds
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_holds (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID         NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    hold_until  TIMESTAMPTZ  NOT NULL,
    created_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
    reason      TEXT,
    status      VARCHAR(20)  NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','expired','released')),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_holds_session_active
    ON session_holds (session_id)
    WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- session_audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_audit (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID         NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    action     TEXT         NOT NULL,
    from_state VARCHAR(20),
    to_state   VARCHAR(20),
    meta       JSONB,
    created_by UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE session_audit IS 'Append-only log of session state transitions and negotiation messages.';

CREATE INDEX IF NOT EXISTS idx_session_audit_session_time
    ON session_audit (session_id, created_at DESC);
