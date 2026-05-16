-- ============================================================================
-- 006_subjects.sql
-- ----------------------------------------------------------------------------
-- Per-teacher catalog of subjects (e.g. Math, English, Physics).
-- Soft-deleted (deleted_at) with a partial unique index that allows the same
-- name to be reused after deletion.
--
-- Consolidates from v1:
--   - 004_create_subjects_table.sql
--
-- v2 corrections (vs v1):
--   - gen_random_uuid() (was uuid_generate_v4).
--   - TIMESTAMPTZ (already correct in v1).
--   - Index naming normalised.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS subjects (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id  UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX        IF NOT EXISTS idx_subjects_teacher_id ON subjects (teacher_id);
CREATE INDEX        IF NOT EXISTS idx_subjects_name       ON subjects (name);
CREATE INDEX        IF NOT EXISTS idx_subjects_deleted_at ON subjects (deleted_at);

-- Prevent duplicate active subject names per teacher.
-- Soft-deleted rows are excluded so a teacher can re-create a subject by name
-- after deleting the old one.
CREATE UNIQUE INDEX IF NOT EXISTS unique_subject_name_per_teacher_active
    ON subjects (teacher_id, name)
    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_subjects_updated_at ON subjects;
CREATE TRIGGER update_subjects_updated_at
    BEFORE UPDATE ON subjects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
