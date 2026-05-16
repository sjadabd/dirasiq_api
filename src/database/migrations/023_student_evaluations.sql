-- ============================================================================
-- 023_student_evaluations.sql
-- ----------------------------------------------------------------------------
-- Six-axis daily rubric: a teacher evaluates a student on scientific,
-- behavioral, attendance, homework preparation, participation, and
-- instruction-following levels. At most one row per (student, teacher, day).
--
-- Consolidates from v1:
--   - 025_create_student_evaluations.sql
--
-- v2 corrections (vs v1):
--   - gen_random_uuid() (was uuid_generate_v4).
--   - TIMESTAMPTZ already correct in v1.
--   - UNIQUE constraint inlined; the DO $$ … $$ guard from v1 removed.
--   - Adds updated_at trigger (missing in v1 — `updated_at` is declared but
--     would never auto-update).
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS student_evaluations (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id            UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    teacher_id            UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    eval_date             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    eval_date_date        DATE         NOT NULL DEFAULT CURRENT_DATE,

    scientific_level      VARCHAR(20)  NOT NULL
        CHECK (scientific_level      IN ('excellent','very_good','good','fair','weak')),
    behavioral_level      VARCHAR(20)  NOT NULL
        CHECK (behavioral_level      IN ('excellent','very_good','good','fair','weak')),
    attendance_level      VARCHAR(20)  NOT NULL
        CHECK (attendance_level      IN ('excellent','very_good','good','fair','weak')),
    homework_preparation  VARCHAR(20)  NOT NULL
        CHECK (homework_preparation  IN ('excellent','very_good','good','fair','weak')),
    participation_level   VARCHAR(20)  NOT NULL
        CHECK (participation_level   IN ('excellent','very_good','good','fair','weak')),
    instruction_following VARCHAR(20)  NOT NULL
        CHECK (instruction_following IN ('excellent','very_good','good','fair','weak')),

    guidance              TEXT,
    notes                 TEXT,

    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT student_evaluations_unique_per_day UNIQUE (student_id, teacher_id, eval_date_date)
);

COMMENT ON COLUMN student_evaluations.eval_date_date IS
    'Date-only field used by the UNIQUE constraint so a teacher can only file one evaluation per student per calendar day.';

CREATE INDEX IF NOT EXISTS idx_student_evaluations_student ON student_evaluations (student_id);
CREATE INDEX IF NOT EXISTS idx_student_evaluations_teacher ON student_evaluations (teacher_id);
CREATE INDEX IF NOT EXISTS idx_student_evaluations_date    ON student_evaluations (eval_date_date);

DROP TRIGGER IF EXISTS update_student_evaluations_updated_at ON student_evaluations;
CREATE TRIGGER update_student_evaluations_updated_at
    BEFORE UPDATE ON student_evaluations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
