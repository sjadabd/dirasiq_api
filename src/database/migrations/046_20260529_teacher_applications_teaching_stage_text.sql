-- ============================================================================
-- 046_20260529_teacher_applications_teaching_stage_text.sql
-- ----------------------------------------------------------------------------
-- Widen `teacher_applications.teaching_stage` from VARCHAR(100) to TEXT.
--
-- The column was sized for a single free-text stage label (e.g. "الإعدادي").
-- Since 045_*.sql, it carries a comma-joined display string built from
-- the grade names the applicant picked. Arabic grade names are typically
-- 14-22 characters each plus the "، " separator, so a teacher who picks
-- five common grades easily produces a 110+ character string. The legacy
-- 100-char cap then trips Postgres' "value too long" check and the API
-- returns a generic 500 on submit.
--
-- Widening to TEXT eliminates the cap without losing any data (every
-- VARCHAR(100) value fits TEXT). The column stays NOT NULL — the service
-- still populates it on every insert.
--
-- Type-narrowing precision loss (see migration-policy rule 22) does NOT
-- apply here: we are WIDENING, not narrowing.
--
-- Idempotent:    yes (no-op if the column is already TEXT)
-- Transactional: handled by the runner.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_name  = 'teacher_applications'
       AND column_name = 'teaching_stage'
       AND data_type   = 'character varying'
  ) THEN
    EXECUTE 'ALTER TABLE teacher_applications ALTER COLUMN teaching_stage TYPE TEXT';
  END IF;
END $$;
