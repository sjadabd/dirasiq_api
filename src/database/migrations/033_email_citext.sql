-- ============================================================================
-- 033_email_citext.sql
-- ----------------------------------------------------------------------------
-- Convert users.email to PostgreSQL's case-insensitive text type (citext) so
-- "User@Example.com" and "user@example.com" are treated as the same address
-- by both the UNIQUE constraint and every `WHERE email = $1` query in the
-- codebase.
--
-- DATABASE_ANALYSIS.md §10.5 "Email is case-sensitive" finding — resolved.
--
-- Behavior change:
--   • The UNIQUE index on users.email becomes case-insensitive automatically
--     (citext equality is case-insensitive).
--   • Every `WHERE email = $1` query in the application now matches
--     regardless of input casing, without any code change.
--   • The existing `users_email_lowercase CHECK (email = LOWER(email))` is
--     dropped: under citext, that expression is always true (so the CHECK
--     never rejects anything), making it dead code. The application still
--     normalizes to lowercase on write for storage / display consistency.
--   • `email ILIKE $1` patterns in src/models/user.model.ts continue to work
--     (ILIKE accepts citext).
--
-- Data preservation:
--   • Existing email values (all lowercase per the prior CHECK) cast to
--     citext losslessly.
--   • The UNIQUE constraint migrates automatically with the column type.
--
-- Idempotent:    yes (CREATE EXTENSION IF NOT EXISTS; ALTER COLUMN TYPE
--                CITEXT is a no-op if already citext, in which case
--                PostgreSQL skips it)
-- Transactional: handled by the runner
-- Reversible:    yes (ALTER COLUMN TYPE VARCHAR(255) USING email::text;
--                then re-add the lowercase CHECK)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS citext;

-- Drop the lowercase invariant CHECK — it's redundant under citext.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_lowercase;

-- Convert email to citext. Existing values cast losslessly.
ALTER TABLE users ALTER COLUMN email TYPE CITEXT USING email::citext;

COMMENT ON COLUMN users.email IS
    'Case-insensitive email address (citext). Application normalizes to lowercase on write for display consistency; lookups via "WHERE email = $1" are case-insensitive at the DB layer.';
