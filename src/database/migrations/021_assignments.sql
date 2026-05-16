-- ============================================================================
-- 021_assignments.sql
-- ----------------------------------------------------------------------------
-- Course assignments, the (optional) per-student recipient list, and student
-- submissions. Three related tables together.
--
-- Consolidates from v1:
--   - 022_create_assignments.sql  (all three tables together)
--
-- v2 corrections (vs v1):
--   - gen_random_uuid() (was uuid_generate_v4).
--   - The per-table `update_assignments_updated_at()` trigger function is
--     REMOVED; the shared `update_updated_at_column()` from 001 is used.
--   - Adds composite (course_id, is_active) index for "active assignments
--     for course X" listings.
--   - Adds composite (assignment_id, status) index for the bulk-grading path.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- assignments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignments (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id       UUID         NOT NULL REFERENCES courses(id)   ON DELETE CASCADE,
    subject_id      UUID         REFERENCES subjects(id)           ON DELETE SET NULL,
    session_id      UUID         REFERENCES sessions(id)           ON DELETE SET NULL,
    teacher_id      UUID         NOT NULL REFERENCES users(id)     ON DELETE CASCADE,

    title           TEXT         NOT NULL,
    description     TEXT,

    assigned_date   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    due_date        TIMESTAMPTZ,
    submission_type VARCHAR(20)  NOT NULL DEFAULT 'mixed'
                        CHECK (submission_type IN ('text','file','link','mixed')),

    attachments     JSONB        NOT NULL DEFAULT '{}'::jsonb,
    resources       JSONB        NOT NULL DEFAULT '[]'::jsonb,

    max_score       INTEGER      NOT NULL DEFAULT 100 CHECK (max_score > 0),
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    visibility      VARCHAR(32)  NOT NULL DEFAULT 'all_students'
                        CHECK (visibility IN ('all_students','group','specific_students')),

    study_year      VARCHAR(20),
    grade_id        UUID         REFERENCES grades(id) ON DELETE SET NULL,

    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID         REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON COLUMN assignments.visibility IS
    'all_students = every student in the course. specific_students = use assignment_recipients to enumerate. group = reserved for future group support.';
COMMENT ON COLUMN assignments.attachments IS 'JSON: teacher-supplied attachments — { "files": [...], "images": [...] }.';
COMMENT ON COLUMN assignments.resources   IS 'JSON array: links to references / videos / external resources.';

CREATE INDEX IF NOT EXISTS idx_assignments_course      ON assignments (course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher     ON assignments (teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due_date    ON assignments (due_date);
CREATE INDEX IF NOT EXISTS idx_assignments_visibility  ON assignments (visibility);

-- Hot path: "active, non-deleted assignments for course X by due date"
CREATE INDEX IF NOT EXISTS idx_assignments_active
    ON assignments (course_id, due_date)
    WHERE is_active = TRUE AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trigger_update_assignments_updated_at ON assignments;
CREATE TRIGGER trigger_update_assignments_updated_at
    BEFORE UPDATE ON assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- assignment_recipients
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignment_recipients (
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id    UUID NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
    PRIMARY KEY (assignment_id, student_id)
);

COMMENT ON TABLE assignment_recipients IS
    'Per-student visibility list used when assignments.visibility = ''specific_students''.';

CREATE INDEX IF NOT EXISTS idx_assignment_recipients_student
    ON assignment_recipients (student_id);

-- ---------------------------------------------------------------------------
-- assignment_submissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignment_submissions (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID         NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id    UUID         NOT NULL REFERENCES users(id)       ON DELETE CASCADE,

    submitted_at  TIMESTAMPTZ,
    status        VARCHAR(20)  NOT NULL DEFAULT 'submitted'
                      CHECK (status IN ('submitted','late','graded','returned')),

    content_text  TEXT,
    link_url      TEXT,
    attachments   JSONB        NOT NULL DEFAULT '[]'::jsonb,

    score         INTEGER,
    graded_at     TIMESTAMPTZ,
    graded_by     UUID         REFERENCES users(id) ON DELETE SET NULL,
    feedback      TEXT,

    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),

    UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student
    ON assignment_submissions (student_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_status
    ON assignment_submissions (status);

-- Hot path: "ungraded submissions for assignment X"
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_ungraded
    ON assignment_submissions (assignment_id, submitted_at)
    WHERE status IN ('submitted','late');

DROP TRIGGER IF EXISTS trigger_update_assignment_submissions_updated_at ON assignment_submissions;
CREATE TRIGGER trigger_update_assignment_submissions_updated_at
    BEFORE UPDATE ON assignment_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
