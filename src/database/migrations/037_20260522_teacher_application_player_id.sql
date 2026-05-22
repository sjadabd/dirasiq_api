-- ============================================================================
-- 037_20260522_teacher_application_player_id.sql
-- ----------------------------------------------------------------------------
-- Teacher Onboarding — Phase 4: record the OneSignal player id at submit
-- time so we can push lifecycle notifications BEFORE the applicant has a
-- user account.
--
-- After approval the new users row carries its own external_user_id, so the
-- approved push targets that. Before approval (submitted / rejected /
-- needs_more_info) the only handle we have to reach the applicant on their
-- device is the player id they shipped with the submit request.
--
-- Email is the fallback path for all four events when this column is NULL.
--
-- Idempotent:    yes (ADD COLUMN IF NOT EXISTS)
-- Transactional: handled by the runner.
-- ============================================================================

ALTER TABLE teacher_applications
    ADD COLUMN IF NOT EXISTS onesignal_player_id VARCHAR(100);

COMMENT ON COLUMN teacher_applications.onesignal_player_id IS
  'Optional OneSignal device/player id captured at submit time. Used to push pre-approval lifecycle events (submitted / rejected / needs_more_info) directly to the device, since the applicant has no users row yet. Cleared on approve since post-approval pushes go through external_user_id on the new users row.';
