-- ============================================================================
-- 022_exams.sql
-- ----------------------------------------------------------------------------
-- Exams (daily / monthly) and per-student grades. Sessions are linked via the
-- separate exam_sessions mapping table (an exam can span multiple sessions).
--
-- Consolidates from v1:
--   - 023_create_exams.sql     (initial exams + exam_grades)
--   - 024_restructure_exams.sql (dropped exams.session_id, added exam_sessions)
--
-- v2 corrections (vs v1):
--   - gen_random_uuid() (was uuid_generate_v4).
--   - TIMESTAMPTZ already correct in v1.
--   - The legacy `exams.session_id` column is never created (was dropped in
--     v1 migration 024). exam_sessions is the m:n bridge.
--   - Adds CHECK on max_score > 0.
--   - Adds composite (course_id, exam_date) index for the "exams calendar"
--     query and (student_id, exam_date) on exam_grades for student history.
--   - Adds updated_at trigger on exams (missing in v1).
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- exams
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exams (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id   UUID         NOT NULL REFERENCES courses(id)   ON DELETE CASCADE,
    subject_id  UUID         NOT NULL REFERENCES subjects(id)  ON DELETE CASCADE,
    teacher_id  UUID         NOT NULL REFERENCES users(id)     ON DELETE CASCADE,

    exam_date   TIMESTAMPTZ  NOT NULL,
    exam_type   VARCHAR(20)  NOT NULL CHECK (exam_type IN ('daily','monthly')),

    max_score   INTEGER      NOT NULL CHECK (max_score > 0),
    description TEXT,
    notes       TEXT,

    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exams_course   ON exams (course_id);
CREATE INDEX IF NOT EXISTS idx_exams_subject  ON exams (subject_id);
CREATE INDEX IF NOT EXISTS idx_exams_teacher  ON exams (teacher_id);

-- Hot path: "list exams for course X around date D"
CREATE INDEX IF NOT EXISTS idx_exams_course_date
    ON exams (course_id, exam_date DESC);

DROP TRIGGER IF EXISTS update_exams_updated_at ON exams;
CREATE TRIGGER update_exams_updated_at
    BEFORE UPDATE ON exams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- exam_sessions  (m:n bridge — an exam can be linked to multiple sessions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exam_sessions (
    exam_id    UUID NOT NULL REFERENCES exams(id)    ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    PRIMARY KEY (exam_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_sessions_session ON exam_sessions (session_id);

-- ---------------------------------------------------------------------------
-- exam_grades
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exam_grades (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id    UUID         NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score      INTEGER      NOT NULL CHECK (score >= 0),
    graded_at  TIMESTAMPTZ  DEFAULT now(),
    graded_by  UUID         REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT exam_grades_unique_per_student UNIQUE (exam_id, student_id)
);

COMMENT ON COLUMN exam_grades.score IS
    'Raw score. The application is responsible for enforcing score <= exams.max_score (cross-table CHECK is not supported in vanilla Postgres).';

-- Hot path: "student X exam history"
CREATE INDEX IF NOT EXISTS idx_exam_grades_student
    ON exam_grades (student_id, graded_at DESC);
