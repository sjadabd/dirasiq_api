-- Migration: persist each teacher's first 20 unique commission-free students
-- Created: 2026-07-19
-- Description: A student's free position is claimed on first confirmation and
-- remains stable across courses, retries, cancellations, and later purchases.

BEGIN;

CREATE TABLE IF NOT EXISTS teacher_commission_free_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  first_booking_id UUID REFERENCES course_bookings(id) ON DELETE SET NULL,
  free_ordinal SMALLINT NOT NULL CHECK (free_ordinal BETWEEN 1 AND 20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, student_id),
  UNIQUE (teacher_id, free_ordinal)
);

CREATE INDEX IF NOT EXISTS idx_teacher_commission_free_students_teacher
  ON teacher_commission_free_students (teacher_id, created_at);

-- Backfill from currently active confirmed/approved bookings only.
-- Ordering uses created_at (not approved_at) because free slots are claimed on
-- first confirmation; approved_at is written later and would skew ordinals.
-- Historically cancelled/rejected confirms are intentionally excluded: we
-- preserve today's live student set rather than inventing a fee-history ledger.
LOCK TABLE teacher_commission_free_students IN EXCLUSIVE MODE;

WITH first_booking_per_student AS (
  SELECT DISTINCT ON (teacher_id, student_id)
    teacher_id,
    student_id,
    id AS booking_id,
    created_at AS first_at
  FROM course_bookings
  WHERE status IN ('confirmed', 'approved')
    AND is_deleted = FALSE
  ORDER BY teacher_id, student_id, created_at, id
),
ranked AS (
  SELECT
    teacher_id,
    student_id,
    booking_id,
    ROW_NUMBER() OVER (
      PARTITION BY teacher_id ORDER BY first_at, booking_id
    ) AS ordinal
  FROM first_booking_per_student
)
INSERT INTO teacher_commission_free_students (
  teacher_id, student_id, first_booking_id, free_ordinal
)
SELECT teacher_id, student_id, booking_id, ordinal
FROM ranked
WHERE ordinal <= 20
ON CONFLICT (teacher_id, student_id) DO NOTHING;

COMMIT;
