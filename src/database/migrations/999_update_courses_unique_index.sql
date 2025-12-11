-- Ensure courses unique constraint allows duplicates when old rows are soft-deleted

-- Drop old constraint if it exists (might be a constraint or an index depending on schema history)
ALTER TABLE IF EXISTS courses
  DROP CONSTRAINT IF EXISTS unique_course_per_teacher_year_grade_subject;

-- Drop any existing index with the same name to avoid conflicts
DROP INDEX IF EXISTS unique_course_per_teacher_year_grade_subject;

-- Recreate as a partial unique index that only enforces uniqueness on non-deleted courses
CREATE UNIQUE INDEX unique_course_per_teacher_year_grade_subject
  ON courses (teacher_id, study_year, course_name, grade_id, subject_id)
  WHERE is_deleted = false;
