-- Migration: add teacher-controlled course registration state
-- Created: 2026-07-19
-- Description: lets a teacher close or reopen new student booking requests.
-- Rollback: ALTER TABLE courses DROP COLUMN IF EXISTS registration_open;

BEGIN;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS registration_open BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN courses.registration_open IS
  'When false, students cannot create or reactivate booking requests for this course.';

COMMIT;
