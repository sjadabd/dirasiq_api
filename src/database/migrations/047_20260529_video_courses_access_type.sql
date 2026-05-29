-- ============================================================================
-- 047_20260529_video_courses_access_type.sql
-- ----------------------------------------------------------------------------
-- Phase 1 of the National Video Marketplace rebuild.
--
-- video_courses gains two columns that drive the new access model:
--
--   access_type VARCHAR(40) — the catalog axis:
--       'public_free_by_grade'    — free; visible to any student whose
--                                   student_grades row matches one of the
--                                   video_course_grade_targets entries.
--       'enrolled_students_free'  — free; visible only to students who
--                                   have a confirmed/approved course_booking
--                                   with this teacher (any course).
--       'marketplace_paid'        — priced; visible to grade-matched
--                                   students AND requires either a paid
--                                   purchase, a whitelist entry, OR the
--                                   flag below + an active enrollment.
--
--   free_for_enrolled_students BOOLEAN — modifier on marketplace_paid:
--       when TRUE, the teacher's enrolled students bypass payment without
--       needing an explicit free_students whitelist row. This replaces the
--       originally-proposed Type 3 (enrolled_students_paid) by giving the
--       teacher a single switch on a normal marketplace course.
--
-- Legacy columns kept (NOT dropped here):
--   visibility — stays for back-compat. Service layer will stop reading it
--                in Phase 2. A future cleanup migration drops it.
--   is_free   — stays for back-compat. Derived state from access_type in v2.
--                The backfill below keeps it consistent with access_type.
--   grade_id  — stays for back-compat. Migration 048 backfills the new
--                pivot from this column; a future migration drops it once
--                Phase 2 stops reading it.
--
-- Backfill policy:
--   - Existing rows with is_free = TRUE  → access_type = 'public_free_by_grade'
--   - Existing rows with is_free = FALSE → access_type = 'marketplace_paid'
--   - free_for_enrolled_students defaults to FALSE for all existing rows.
--
-- Idempotent:    yes — IF NOT EXISTS on column adds, WHERE NULL guard on
--                       the UPDATE so re-runs do not re-stamp values.
-- Transactional: handled by the runner.
-- ============================================================================

ALTER TABLE video_courses
    ADD COLUMN IF NOT EXISTS access_type VARCHAR(40);

ALTER TABLE video_courses
    ADD COLUMN IF NOT EXISTS free_for_enrolled_students BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill access_type from the legacy is_free column. Only writes rows
-- that haven't been stamped yet (re-run safe).
UPDATE video_courses
   SET access_type = CASE
       WHEN is_free = TRUE THEN 'public_free_by_grade'
       ELSE 'marketplace_paid'
   END
 WHERE access_type IS NULL;

-- Enforce NOT NULL once every row has a value. Add the CHECK constraint
-- via a named constraint so a future ALTER can target it by name.
ALTER TABLE video_courses
    ALTER COLUMN access_type SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'video_courses_access_type_check'
    ) THEN
        ALTER TABLE video_courses
            ADD CONSTRAINT video_courses_access_type_check
            CHECK (access_type IN (
                'public_free_by_grade',
                'enrolled_students_free',
                'marketplace_paid'
            ));
    END IF;
END $$;

COMMENT ON COLUMN video_courses.access_type IS
    'Catalogue axis: public_free_by_grade | enrolled_students_free | marketplace_paid. Drives fn_student_can_view_video_course alongside grade_targets, target_courses, free_students, and purchases.';
COMMENT ON COLUMN video_courses.free_for_enrolled_students IS
    'Modifier for marketplace_paid: when TRUE the teacher''s currently-enrolled students bypass payment. Ignored for the other access types.';
