-- ============================================================================
-- 011_courses.sql
-- ----------------------------------------------------------------------------
-- Courses offered by teachers, scoped by (study_year × grade × subject).
-- Soft-deleted. Supports a reservation amount (the deposit a student pays to
-- confirm a booking).
--
-- Consolidates from v1:
--   - 006_create_courses_table.sql
--   - 999_update_courses_unique_index.sql  (replaced legacy unique constraint
--                                            with the partial index inlined here)
--
-- v2 corrections (vs v1):
--   - gen_random_uuid() (was uuid_generate_v4).
--   - TIMESTAMPTZ explicit (v1 already used WITH TIME ZONE, normalised syntax).
--   - Money columns widened to DECIMAL(14,2).
--   - All CHECK / UNIQUE constraints inlined; v1's DO $$ … $$ guards removed.
--
-- Idempotent:    yes
-- Transactional: handled by the runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS courses (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id         UUID          NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    study_year         VARCHAR(9)    NOT NULL CHECK (study_year ~ '^\d{4}-\d{4}$'),
    grade_id           UUID          NOT NULL REFERENCES grades(id)   ON DELETE CASCADE,
    subject_id         UUID          NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    course_name        VARCHAR(255)  NOT NULL,
    course_images      TEXT[],
    description        TEXT,
    start_date         DATE          NOT NULL,
    end_date           DATE          NOT NULL,
    price              DECIMAL(14,2) NOT NULL CHECK (price >= 0),
    seats_count        INTEGER       NOT NULL CHECK (seats_count > 0),

    -- Reservation deposit
    has_reservation    BOOLEAN       NOT NULL DEFAULT FALSE,
    reservation_amount DECIMAL(14,2),

    is_deleted         BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT check_dates CHECK (end_date > start_date),

    -- Either no reservation, or amount is present, > 0, and ≤ price.
    CONSTRAINT chk_courses_reservation_amount CHECK (
        (has_reservation = FALSE AND reservation_amount IS NULL)
        OR
        (has_reservation = TRUE
            AND reservation_amount IS NOT NULL
            AND reservation_amount > 0
            AND reservation_amount <= price)
    )
);

COMMENT ON COLUMN courses.course_images      IS 'Array of stored image paths (typically /public/uploads/courses/<course_id>/…).';
COMMENT ON COLUMN courses.reservation_amount IS 'Deposit a student pays to confirm a booking. NULL when has_reservation = FALSE.';

CREATE INDEX        IF NOT EXISTS idx_courses_teacher_id  ON courses (teacher_id);
CREATE INDEX        IF NOT EXISTS idx_courses_grade_id    ON courses (grade_id);
CREATE INDEX        IF NOT EXISTS idx_courses_subject_id  ON courses (subject_id);
CREATE INDEX        IF NOT EXISTS idx_courses_study_year  ON courses (study_year);
CREATE INDEX        IF NOT EXISTS idx_courses_course_name ON courses (course_name);
CREATE INDEX        IF NOT EXISTS idx_courses_is_deleted  ON courses (is_deleted);

-- Partial unique: one active course per (teacher × year × grade × subject × name).
-- Soft-deleted rows are excluded, so a teacher can re-create the same combo
-- after deleting the previous course.
CREATE UNIQUE INDEX IF NOT EXISTS unique_course_per_teacher_year_grade_subject
    ON courses (teacher_id, study_year, course_name, grade_id, subject_id)
    WHERE is_deleted = FALSE;

DROP TRIGGER IF EXISTS update_courses_updated_at ON courses;
CREATE TRIGGER update_courses_updated_at
    BEFORE UPDATE ON courses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
