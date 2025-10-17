-- Drop invoice_entries table as part of simplified billing model
-- NOTE: Ensure application code no longer references this table before running this migration.

BEGIN;

-- If table exists, drop dependent objects then drop table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'invoice_entries'
  ) THEN
    DROP TABLE IF EXISTS invoice_entries CASCADE;
  END IF;
END$$;

COMMIT;
