-- ============================================================================
-- 052_20260529_wayl_payment_links_video_course_routing.sql
-- ----------------------------------------------------------------------------
-- Wire wayl_payment_links into the video-course purchase flow.
--
-- The webhook handler at /api/payments/wayl/webhook routes on
-- wayl_payment_links.purpose. Phase 7 supported 'subscription' (since
-- removed) and 'wallet_topup'. Phase 1 of the marketplace adds:
--
--   'video_course_purchase'
--
-- The purpose column is a free-form VARCHAR(30) (no CHECK constraint in
-- migration 028), so no constraint change is required — the value is
-- just a new allowed string from the application's perspective.
--
-- We also add an OPTIONAL link to the matching video_course_purchases
-- row so admin tooling can pivot from "a Wayl link" to "which purchase
-- this paid for". The webhook handler is what writes this value during
-- link creation in the new purchase service (Phase 4).
--
-- ON DELETE SET NULL on the FK: a stale wayl_payment_links row that's
-- manually purged should NOT cascade and corrupt the purchase audit
-- trail. The purchase row keeps the snapshot of all financial fields it
-- needs independent of the gateway link record.
--
-- Idempotent:    yes (IF NOT EXISTS on the column add).
-- Transactional: handled by the runner.
-- ============================================================================

ALTER TABLE wayl_payment_links
    ADD COLUMN IF NOT EXISTS video_course_purchase_id UUID
        REFERENCES video_course_purchases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wpl_video_course_purchase
    ON wayl_payment_links (video_course_purchase_id)
    WHERE video_course_purchase_id IS NOT NULL;

COMMENT ON COLUMN wayl_payment_links.video_course_purchase_id IS
    'Back-link to the video_course_purchases row this Wayl link pays for. NULL for non-marketplace purposes (wallet_topup, future subscription flows, ...).';
