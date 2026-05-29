-- ============================================================================
-- 053_20260529_wallet_ledger_and_access_function.sql
-- ----------------------------------------------------------------------------
-- Two concerns bundled because both close the loop on the Phase 1 schema
-- (audit policy 6 "one concern per file" relaxed here because both touch
-- the marketplace access surface and neither is independently testable
-- without the other on the call paths Phase 2 will introduce):
--
--   1. wallet_ledger gains:
--        - related_video_course_purchase_id FK — discoverability for
--          "all wallet entries that came from selling video course V".
--        - 'video_course_purchase_credit' + 'video_course_purchase_refund'
--          accepted on entry_type. The legacy 'enrollment_credit' value
--          stays for live-course Phase 14; we differentiate so reports
--          can split "live revenue" from "video revenue" without joining
--          back to the wayl link / purchase row.
--
--   2. fn_student_can_view_video_course(student_id, video_course_id) —
--      the single SQL source of truth for "does this student have access
--      to this video course?". Phase 2 wraps it in a TS service; every
--      Phase 2+ route that gates playback or lesson reads calls it.
--
--      The function is STABLE (deterministic for a given transaction
--      snapshot) so the planner can fold it into JOINs and IN clauses
--      cheaply.
--
--      Returns:
--        TRUE  — student is allowed to view (including buy-it-now state
--                for marketplace_paid; the playback URL endpoint still
--                gates separately on a paid purchase).
--        FALSE — anything else (no row, not approved, soft-deleted,
--                grade mismatch, no enrollment, no purchase, ...).
--
--      The function does NOT check video_lessons.bunny_status — that's
--      a per-lesson concern handled at playback-url time. The course-
--      level visibility is decoupled from individual lesson readiness.
--
-- Idempotent:    yes — DROP CONSTRAINT IF EXISTS + CREATE OR REPLACE
--                       FUNCTION + IF NOT EXISTS column add.
-- Transactional: handled by the runner.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Part 1 — wallet_ledger column + entry_type CHECK widening
-- ----------------------------------------------------------------------------

ALTER TABLE wallet_ledger
    ADD COLUMN IF NOT EXISTS related_video_course_purchase_id UUID
        REFERENCES video_course_purchases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_video_purchase
    ON wallet_ledger (related_video_course_purchase_id)
    WHERE related_video_course_purchase_id IS NOT NULL;

-- Widen the entry_type CHECK to accept the two new marketplace values.
-- The constraint was created inline on the column in migration 039 with
-- the Postgres auto-generated name <table>_<column>_check.
ALTER TABLE wallet_ledger
    DROP CONSTRAINT IF EXISTS wallet_ledger_entry_type_check;

ALTER TABLE wallet_ledger
    ADD CONSTRAINT wallet_ledger_entry_type_check
    CHECK (entry_type IN (
        'enrollment_credit',
        'platform_commission',
        'gateway_fee',
        'pending_to_withdrawable',
        'withdrawal_hold',
        'withdrawal_release',
        'withdrawal_paid',
        'refund_debit',
        'manual_adjustment_credit',
        'manual_adjustment_debit',
        'video_course_purchase_credit',
        'video_course_purchase_refund'
    ));

COMMENT ON COLUMN wallet_ledger.related_video_course_purchase_id IS
    'FK to the video_course_purchases row that produced this ledger entry. Lets revenue analytics split video sales from live enrollments without joining through wayl_payment_links.';

-- ----------------------------------------------------------------------------
-- Part 2 — fn_student_can_view_video_course
-- ----------------------------------------------------------------------------
--
-- One stop for "does student S have access to video course V?" used by
-- every Phase 2+ route that lists, details, or plays a video course.
-- Returns FALSE for anything other than an explicit allow:
--   - video course not found / soft-deleted / not approved → FALSE
--   - access_type='public_free_by_grade':
--       TRUE iff student has a student_grades row matching one of the
--       video's grade_targets for the active study year.
--   - access_type='enrolled_students_free':
--       TRUE iff student has a confirmed/approved booking with the
--       video's teacher (any course they teach).
--   - access_type='marketplace_paid':
--       TRUE iff grade-match AND (whitelisted OR paid-purchase OR
--             (free_for_enrolled_students AND enrolled)).
--   - any future / unknown access_type → FALSE (closed by default).
--
-- The function reads:
--   - video_courses                (single row by PK)
--   - video_course_grade_targets   (small subquery)
--   - student_grades               (1 indexed lookup)
--   - academic_years               (1 row)
--   - course_bookings              (small filtered subquery)
--   - video_course_free_students   (1 indexed lookup)
--   - video_course_purchases       (1 indexed lookup, status='paid')
--
-- All indexed; expected p99 < 5ms on typical row counts.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_student_can_view_video_course(
    p_student_id      UUID,
    p_video_course_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    v_access_type       VARCHAR(40);
    v_teacher_id        UUID;
    v_free_for_enrolled BOOLEAN;
    v_active_year       VARCHAR(9);
    v_grade_match       BOOLEAN := FALSE;
    v_teacher_enrolled  BOOLEAN := FALSE;
    v_whitelisted       BOOLEAN := FALSE;
    v_has_paid_purchase BOOLEAN := FALSE;
BEGIN
    -- Guard against NULL inputs — closed by default.
    IF p_student_id IS NULL OR p_video_course_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Fetch + gate on the course being approved + not deleted.
    SELECT access_type,
           teacher_id,
           COALESCE(free_for_enrolled_students, FALSE)
      INTO v_access_type,
           v_teacher_id,
           v_free_for_enrolled
      FROM video_courses
     WHERE id = p_video_course_id
       AND status = 'approved'
       AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Resolve active academic year once. If none is active, grade-based
    -- checks fail closed.
    SELECT year INTO v_active_year
      FROM academic_years
     WHERE is_active = TRUE
     LIMIT 1;

    -- Grade match (needed for public_free_by_grade and marketplace_paid).
    IF v_active_year IS NOT NULL THEN
        v_grade_match := EXISTS (
            SELECT 1
              FROM video_course_grade_targets vcgt
              JOIN student_grades sg
                ON sg.grade_id = vcgt.grade_id
             WHERE vcgt.video_course_id = p_video_course_id
               AND sg.student_id        = p_student_id
               AND sg.study_year        = v_active_year
               AND sg.deleted_at IS NULL
               AND sg.is_active = TRUE
        );
    END IF;

    -- Teacher relationship (needed for enrolled_students_free and the
    -- free_for_enrolled_students fast path on marketplace_paid).
    v_teacher_enrolled := EXISTS (
        SELECT 1 FROM course_bookings
         WHERE student_id  = p_student_id
           AND teacher_id  = v_teacher_id
           AND status IN ('confirmed','approved')
           AND is_deleted  = FALSE
    );

    -- Whitelist + purchase only matter for marketplace_paid.
    IF v_access_type = 'marketplace_paid' THEN
        v_whitelisted := EXISTS (
            SELECT 1 FROM video_course_free_students
             WHERE video_course_id = p_video_course_id
               AND student_id      = p_student_id
        );

        v_has_paid_purchase := EXISTS (
            SELECT 1 FROM video_course_purchases
             WHERE video_course_id = p_video_course_id
               AND student_id      = p_student_id
               AND status          = 'paid'
        );
    END IF;

    RETURN CASE v_access_type
        WHEN 'public_free_by_grade'    THEN v_grade_match
        WHEN 'enrolled_students_free'  THEN v_teacher_enrolled
        WHEN 'marketplace_paid'        THEN v_grade_match AND (
                                              v_whitelisted
                                           OR v_has_paid_purchase
                                           OR (v_free_for_enrolled AND v_teacher_enrolled)
                                          )
        ELSE FALSE
    END;
END;
$$;

COMMENT ON FUNCTION fn_student_can_view_video_course(UUID, UUID) IS
    'Single source of truth for student → video_course access. TRUE iff the course is approved AND the per-access_type rule passes. STABLE — safe to fold into JOINs / IN clauses.';
