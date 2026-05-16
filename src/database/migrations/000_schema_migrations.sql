-- ============================================================================
-- 000_schema_migrations.sql
-- ----------------------------------------------------------------------------
-- Ledger table that records every migration that has been applied.
-- The v2 runner (src/database/init-v2.ts) reads this table at startup and
-- skips files whose `filename` is already recorded.
--
-- This file MUST run first. The runner ensures that.
--
-- Replaces:    (new — no legacy equivalent)
-- Idempotent:  yes (CREATE TABLE IF NOT EXISTS)
-- Transactional: handled by the runner; this file is pure DDL.
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    TEXT        PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    checksum    TEXT
);

COMMENT ON TABLE schema_migrations IS
    'Records every migration filename applied to this database. The runner uses this to skip re-application. Do not edit by hand except during the legacy-backfill step of the v1→v2 cutover.';

COMMENT ON COLUMN schema_migrations.filename IS
    'The migration filename, e.g. "001_users.sql". Primary key.';

COMMENT ON COLUMN schema_migrations.applied_at IS
    'When the migration was successfully committed.';

COMMENT ON COLUMN schema_migrations.checksum IS
    'SHA-256 of the file contents at apply time. Lets us detect retroactive edits.';
