-- ============================================================================
-- test_video_course_purchase.sql
-- ----------------------------------------------------------------------------
-- Phase 4 — manual smoke test for the marketplace purchase pipeline at the
-- database / model / constraint level. Covers:
--
--   1. INSERT pending purchase → row created.
--   2. Duplicate pending blocked by the
--      uniq_vcp_active_per_student partial unique index.
--   3. markPaid is idempotent (second call returns no rows).
--   4. Refund within window — markRefunded + wallet_ledger refund entry.
--   5. Re-buy after refund SUCCEEDS — the partial unique excludes refunded.
--   6. Refund after 7 days SHOULD be blocked at the service layer.
--      The DB itself does not enforce the window — we simulate the
--      service check by computing the age inline and asserting.
--
-- Strategy: seed minimal users / grade / course rows, then drive the
-- purchase workflow via direct INSERT / UPDATE matching what the service
-- writes. Everything ROLLBACK'd at the end.
--
-- Usage:
--   PGPASSWORD=<pwd> psql -h <host> -U <user> -d <db> \
--     -f src/scripts/test_video_course_purchase.sql
-- ============================================================================

BEGIN;

-- Guard: need an active academic year.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM academic_years WHERE is_active = TRUE) THEN
        RAISE EXCEPTION 'Test prerequisite missing: no active academic year.';
    END IF;
END $$;

-- Fixtures.
INSERT INTO users (id, name, email, password, user_type, status, auth_provider, email_verified)
VALUES
    ('11111111-1111-4111-8111-aaaaaaaaaaaa', 'Phase4 Teacher', 't-vcp@example.com', 'x', 'teacher', 'active', 'email', true),
    ('11111111-1111-4111-8111-bbbbbbbbbbbb', 'Phase4 Student', 's-vcp@example.com', 'x', 'student', 'active', 'email', true);

INSERT INTO grades (id, name) VALUES
    ('11111111-1111-4111-8111-cccccccccccc', 'P4 Test Grade');

INSERT INTO student_grades (student_id, grade_id, study_year)
SELECT '11111111-1111-4111-8111-bbbbbbbbbbbb',
       '11111111-1111-4111-8111-cccccccccccc',
       year
  FROM academic_years WHERE is_active = TRUE LIMIT 1;

INSERT INTO video_courses (id, teacher_id, title, subject, teaching_stage, grade_id, status, access_type, price)
VALUES ('22222222-2222-4222-8222-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-aaaaaaaaaaaa',
        'Phase4 Test Marketplace Course', 'Math', 'Sixth',
        '11111111-1111-4111-8111-cccccccccccc',
        'approved', 'marketplace_paid', 50000);

INSERT INTO video_course_grade_targets (video_course_id, grade_id) VALUES
    ('22222222-2222-4222-8222-aaaaaaaaaaaa', '11111111-1111-4111-8111-cccccccccccc');

-- ----------------------------------------------------------------------------
-- 1. INSERT pending → row created
-- ----------------------------------------------------------------------------
\echo '--- Scenario 1: insert pending purchase'
INSERT INTO video_course_purchases (
    id, video_course_id, student_id, teacher_id,
    amount_iqd, platform_commission_percent,
    platform_commission_iqd, teacher_net_iqd, status
) VALUES (
    '33333333-3333-4333-8333-111111111111',
    '22222222-2222-4222-8222-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-bbbbbbbbbbbb',
    '11111111-1111-4111-8111-aaaaaaaaaaaa',
    50000, 15, 7500, 42500, 'pending'
);

SELECT
    CASE WHEN status = 'pending' THEN '✓ pending row created'
         ELSE '✗ unexpected status: ' || status END AS scenario_1
  FROM video_course_purchases WHERE id = '33333333-3333-4333-8333-111111111111';

-- ----------------------------------------------------------------------------
-- 2. Duplicate pending blocked
-- ----------------------------------------------------------------------------
\echo '--- Scenario 2: duplicate pending should fail (23505)'
DO $$
BEGIN
    BEGIN
        INSERT INTO video_course_purchases (
            id, video_course_id, student_id, teacher_id,
            amount_iqd, platform_commission_percent,
            platform_commission_iqd, teacher_net_iqd, status
        ) VALUES (
            gen_random_uuid(),
            '22222222-2222-4222-8222-aaaaaaaaaaaa',
            '11111111-1111-4111-8111-bbbbbbbbbbbb',
            '11111111-1111-4111-8111-aaaaaaaaaaaa',
            50000, 15, 7500, 42500, 'pending'
        );
        RAISE EXCEPTION '✗ duplicate pending insert did NOT fail';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE '✓ duplicate pending blocked by unique index';
    END;
END $$;

-- ----------------------------------------------------------------------------
-- 3. markPaid → idempotent
-- ----------------------------------------------------------------------------
\echo '--- Scenario 3: markPaid idempotent'
-- First call flips pending → paid.
WITH first_flip AS (
    UPDATE video_course_purchases
       SET status = 'paid', paid_at = NOW() - INTERVAL '1 day'
     WHERE id = '33333333-3333-4333-8333-111111111111'
       AND status = 'pending'
     RETURNING id
)
SELECT CASE WHEN COUNT(*) = 1 THEN '✓ first markPaid flipped 1 row'
            ELSE '✗ first markPaid affected ' || COUNT(*) END AS scenario_3a
  FROM first_flip;

-- Second call must affect 0 rows (idempotent).
WITH second_flip AS (
    UPDATE video_course_purchases
       SET status = 'paid', paid_at = NOW()
     WHERE id = '33333333-3333-4333-8333-111111111111'
       AND status = 'pending'
     RETURNING id
)
SELECT CASE WHEN COUNT(*) = 0 THEN '✓ second markPaid is no-op (idempotent)'
            ELSE '✗ second markPaid affected ' || COUNT(*) END AS scenario_3b
  FROM second_flip;

-- ----------------------------------------------------------------------------
-- 4. Refund within window — write wallet_ledger refund entry
-- ----------------------------------------------------------------------------
\echo '--- Scenario 4: refund within window'

-- Pre-credit the teacher wallet so the refund has something to claw back.
-- (Phase 4 service does this via WalletService.creditVideoCoursePurchase
-- from the webhook handler. We simulate the post-credit state.)
INSERT INTO teacher_wallets (teacher_id, pending_balance, lifetime_earnings)
VALUES ('11111111-1111-4111-8111-aaaaaaaaaaaa', 42500, 42500)
ON CONFLICT (teacher_id) DO UPDATE
   SET pending_balance   = teacher_wallets.pending_balance   + EXCLUDED.pending_balance,
       lifetime_earnings = teacher_wallets.lifetime_earnings + EXCLUDED.lifetime_earnings;

-- Verify the refund window check would PASS for our paid_at (1 day ago).
SELECT
    CASE WHEN EXTRACT(EPOCH FROM (NOW() - paid_at)) / 86400 <= 7
         THEN '✓ refund window check passes (' || ROUND(EXTRACT(EPOCH FROM (NOW() - paid_at)) / 86400) || ' days)'
         ELSE '✗ refund window check would fail' END AS scenario_4a
  FROM video_course_purchases WHERE id = '33333333-3333-4333-8333-111111111111';

-- Simulate the wallet debit + status flip transactionally.
UPDATE teacher_wallets
   SET pending_balance   = pending_balance - 42500,
       lifetime_earnings = lifetime_earnings - 42500
 WHERE teacher_id = '11111111-1111-4111-8111-aaaaaaaaaaaa';

INSERT INTO wallet_ledger (
    teacher_id, entry_type, amount,
    balance_pending_after, balance_withdrawable_after,
    related_video_course_purchase_id,
    actor_user_id, idempotency_key, notes
) VALUES (
    '11111111-1111-4111-8111-aaaaaaaaaaaa',
    'video_course_purchase_refund',
    -42500,
    0, 0,
    '33333333-3333-4333-8333-111111111111',
    NULL,
    'vcp_refund:33333333-3333-4333-8333-111111111111',
    'P4 smoke test'
);

UPDATE video_course_purchases
   SET status = 'refunded', refunded_at = NOW(), refund_reason = 'P4 smoke test'
 WHERE id = '33333333-3333-4333-8333-111111111111'
   AND status = 'paid';

SELECT
    CASE WHEN status = 'refunded' THEN '✓ status flipped to refunded'
         ELSE '✗ unexpected status: ' || status END AS scenario_4b
  FROM video_course_purchases WHERE id = '33333333-3333-4333-8333-111111111111';

-- The refund ledger entry must exist with the negative amount.
SELECT
    CASE WHEN amount = -42500 AND entry_type = 'video_course_purchase_refund'
         THEN '✓ refund ledger entry written'
         ELSE '✗ unexpected ledger entry: ' || entry_type || ' / ' || amount END AS scenario_4c
  FROM wallet_ledger
 WHERE related_video_course_purchase_id = '33333333-3333-4333-8333-111111111111'
   AND entry_type = 'video_course_purchase_refund';

-- ----------------------------------------------------------------------------
-- 5. Re-buy after refund → unique partial index DOES NOT block
-- ----------------------------------------------------------------------------
\echo '--- Scenario 5: re-buy after refund'
DO $$
BEGIN
    BEGIN
        INSERT INTO video_course_purchases (
            id, video_course_id, student_id, teacher_id,
            amount_iqd, platform_commission_percent,
            platform_commission_iqd, teacher_net_iqd, status
        ) VALUES (
            '33333333-3333-4333-8333-222222222222',
            '22222222-2222-4222-8222-aaaaaaaaaaaa',
            '11111111-1111-4111-8111-bbbbbbbbbbbb',
            '11111111-1111-4111-8111-aaaaaaaaaaaa',
            50000, 15, 7500, 42500, 'pending'
        );
        RAISE NOTICE '✓ re-buy after refund succeeded';
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION '✗ re-buy after refund unexpectedly blocked';
    END;
END $$;

-- ----------------------------------------------------------------------------
-- 6. Refund window timeout simulation (>7 days)
-- ----------------------------------------------------------------------------
\echo '--- Scenario 6: refund-window timeout simulation'

-- Set the re-buy from scenario 5 to paid 10 days ago.
UPDATE video_course_purchases
   SET status = 'paid', paid_at = NOW() - INTERVAL '10 days'
 WHERE id = '33333333-3333-4333-8333-222222222222';

-- The service-layer check is:
--   (NOW - paid_at) / 86400 > 7  → reject
SELECT
    CASE WHEN EXTRACT(EPOCH FROM (NOW() - paid_at)) / 86400 > 7
         THEN '✓ refund window check correctly rejects (' || ROUND(EXTRACT(EPOCH FROM (NOW() - paid_at)) / 86400) || ' days)'
         ELSE '✗ refund window check would pass when it should reject' END AS scenario_6
  FROM video_course_purchases WHERE id = '33333333-3333-4333-8333-222222222222';

-- Rollback so the test leaves no trace.
ROLLBACK;
