-- Migration: allow super admins to make newly submitted advertisements free
-- Created: 2026-07-19
-- Rollback: ALTER TABLE advertisement_settings DROP COLUMN free_clicks_enabled;

BEGIN;

ALTER TABLE advertisement_settings
  ADD COLUMN IF NOT EXISTS free_clicks_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN advertisement_settings.free_clicks_enabled IS
  'When true, newly submitted advertisements require no budget and record clicks at zero cost.';

COMMIT;
