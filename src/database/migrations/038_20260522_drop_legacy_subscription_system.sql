-- ============================================================================
-- 038_20260522_drop_legacy_subscription_system.sql
-- ----------------------------------------------------------------------------
-- IRREVERSIBLE — legacy subscription / capacity / booking-usage stack removed.
--
-- Phase 7 of the platform rebuild. MulhimIQ's commercial model has shifted
-- from per-teacher subscription packages to per-course commission + wallet.
-- The four legacy tables and one wayl FK column become dead weight:
--
--   subscription_packages           — plan catalogue (Free/Basic/Pro)
--   teacher_subscriptions           — per-teacher active plan + cycle
--   teacher_subscription_bonuses    — referral bonus credits on a plan
--   teacher_student_capacity        — denormalised "max students" cache
--   booking_usage_logs              — append-only audit of capacity changes
--   wayl_payment_links.subscription_package_id
--
-- Data path: NONE — the platform has not launched publicly. The local /
-- staging databases hold only seed and developer-test rows. Production has
-- never accepted a real subscription payment. No backup is required.
--
-- Order of drops respects FK dependencies. CASCADE is intentional on
-- teacher_subscriptions because booking_usage_logs and
-- teacher_subscription_bonuses both reference it; we explicitly drop both
-- BEFORE the parent so the cascade is a no-op safeguard, not load-bearing.
--
-- After this migration the runtime code that imported any of these models
-- has already been removed in the same commit (see backend changes in this
-- phase). Should this migration ship against an unrelated branch and find
-- the code still present, every reference will raise at boot — that is
-- preferred over silent data corruption.
--
-- Idempotent:    yes (DROP IF EXISTS / IF EXISTS on ALTER)
-- Transactional: runner-managed
-- ============================================================================

-- 1. wayl link: detach from the soon-to-be-dropped catalogue.
ALTER TABLE wayl_payment_links
  DROP COLUMN IF EXISTS subscription_package_id;

-- 2. dependent audit / bonus tables go first.
DROP TABLE IF EXISTS teacher_subscription_bonuses CASCADE;
DROP TABLE IF EXISTS booking_usage_logs           CASCADE;

-- 3. per-teacher subscription row.
DROP TABLE IF EXISTS teacher_subscriptions        CASCADE;

-- 4. denormalised capacity cache — bound to subscription tier.
DROP TABLE IF EXISTS teacher_student_capacity     CASCADE;

-- 5. plan catalogue.
DROP TABLE IF EXISTS subscription_packages        CASCADE;
