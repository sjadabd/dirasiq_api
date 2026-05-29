-- ============================================================================
-- test_fn_student_can_view_video_course.sql
-- ----------------------------------------------------------------------------
-- Manual smoke test for the access function added in migration 053.
--
-- Strategy: create one purpose-built video course per scenario, each with
-- exactly the state required. No SAVEPOINTs — each scenario has its own
-- video so cumulative state is not a concern. Everything ROLLBACK'd at
-- the end so the script leaves no rows behind.
--
-- Usage:
--   PGPASSWORD=<pwd> psql -h <host> -U <user> -d <db> \
--     -f src/scripts/test_fn_student_can_view_video_course.sql
--
-- Pass criteria:
--   Every row in the final report has status='✓'. The summary at the
--   bottom must show passed = total.
-- ============================================================================

BEGIN;

-- Guard: active academic year is required for grade-based scenarios.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM academic_years WHERE is_active = TRUE) THEN
        RAISE EXCEPTION 'Test prerequisite missing: no active academic year. Insert one with is_active=TRUE before running this script.';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Shared fixtures: teacher, student, grade, subject, live course.
-- ----------------------------------------------------------------------------
INSERT INTO users (id, name, email, password, user_type, status, auth_provider, email_verified)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Teacher A VCA', 'test-teacher-a-vca@example.com', 'x', 'teacher', 'active', 'email', true),
    -- Teacher B exists so S3's "enrolled_students_free + NO booking" can
    -- be tested cleanly: the student has a booking with A (needed for
    -- S4 / S8) but NOT with B, so a video owned by B + access_type=
    -- enrolled_students_free must return FALSE.
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', 'Test Teacher B VCA', 'test-teacher-b-vca@example.com', 'x', 'teacher', 'active', 'email', true),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Test Student VCA',   'test-student-vca@example.com',   'x', 'student', 'active', 'email', true);

INSERT INTO grades (id, name)
VALUES
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Test Grade VCA-1'),  -- the student's grade
    ('cccccccc-cccc-cccc-cccc-cccccccccddd', 'Test Grade VCA-2');  -- a DIFFERENT grade (for no-match)

-- Student is in grade VCA-1 for the active study year.
INSERT INTO student_grades (student_id, grade_id, study_year)
SELECT 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
       'cccccccc-cccc-cccc-cccc-cccccccccccc',
       year
  FROM academic_years WHERE is_active = TRUE LIMIT 1;

INSERT INTO subjects (id, teacher_id, name)
VALUES ('77777777-7777-7777-7777-777777777777',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'Test Subject VCA');

-- Live course owned by the teacher in the student's grade.
INSERT INTO courses (
    id, teacher_id, grade_id, subject_id, study_year,
    course_name, start_date, end_date, price, seats_count
)
SELECT 'dddddddd-dddd-dddd-dddd-dddddddddddd',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'cccccccc-cccc-cccc-cccc-cccccccccccc',
       '77777777-7777-7777-7777-777777777777',
       year,
       'Test Live Course VCA',
       CURRENT_DATE,
       CURRENT_DATE + INTERVAL '90 days',
       50000,
       30
  FROM academic_years WHERE is_active = TRUE LIMIT 1;

-- ----------------------------------------------------------------------------
-- Eight purpose-built video courses, one per scenario.
-- ----------------------------------------------------------------------------
INSERT INTO video_courses (
    id, teacher_id, title, subject, teaching_stage,
    grade_id, status, access_type, free_for_enrolled_students
) VALUES
    -- S1: public_free_by_grade, grade match (student's grade)
    ('10000000-0000-0000-0000-000000000001',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'S1 Public Free Match', 'Math', 'Sixth',
     'cccccccc-cccc-cccc-cccc-cccccccccccc',
     'approved', 'public_free_by_grade', FALSE),

    -- S2: public_free_by_grade, NO grade match (different grade)
    ('20000000-0000-0000-0000-000000000002',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'S2 Public Free No Match', 'Math', 'Sixth',
     'cccccccc-cccc-cccc-cccc-cccccccccddd',
     'approved', 'public_free_by_grade', FALSE),

    -- S3: enrolled_students_free, owned by Teacher B (student is
    -- enrolled with Teacher A only). Student has NO booking with this
    -- teacher → expected FALSE.
    ('30000000-0000-0000-0000-000000000003',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab',
     'S3 Enrolled Free No Booking (Teacher B)', 'Math', 'Sixth',
     'cccccccc-cccc-cccc-cccc-cccccccccccc',
     'approved', 'enrolled_students_free', FALSE),

    -- S4: enrolled_students_free, student WILL have a confirmed booking (inserted below)
    ('40000000-0000-0000-0000-000000000004',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'S4 Enrolled Free With Booking', 'Math', 'Sixth',
     'cccccccc-cccc-cccc-cccc-cccccccccccc',
     'approved', 'enrolled_students_free', FALSE),

    -- S5: marketplace_paid, no purchase, no whitelist, no enrollment bypass
    ('50000000-0000-0000-0000-000000000005',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'S5 Market Paid No Auth', 'Math', 'Sixth',
     'cccccccc-cccc-cccc-cccc-cccccccccccc',
     'approved', 'marketplace_paid', FALSE),

    -- S6: marketplace_paid, student IS whitelisted (inserted below)
    ('60000000-0000-0000-0000-000000000006',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'S6 Market Paid Whitelisted', 'Math', 'Sixth',
     'cccccccc-cccc-cccc-cccc-cccccccccccc',
     'approved', 'marketplace_paid', FALSE),

    -- S7: marketplace_paid, student has paid purchase (inserted below)
    ('70000000-0000-0000-0000-000000000007',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'S7 Market Paid Purchased', 'Math', 'Sixth',
     'cccccccc-cccc-cccc-cccc-cccccccccccc',
     'approved', 'marketplace_paid', FALSE),

    -- S8: marketplace_paid, free_for_enrolled_students=TRUE, student has booking
    ('80000000-0000-0000-0000-000000000008',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'S8 Market Paid Free For Enrolled', 'Math', 'Sixth',
     'cccccccc-cccc-cccc-cccc-cccccccccccc',
     'approved', 'marketplace_paid', TRUE);

-- Grade targets — for every video that uses grade-based gating (S1, S2,
-- S5, S6, S7, S8). S3, S4 use enrollment, no grade target needed.
-- S2 deliberately targets the DIFFERENT grade so the student does NOT match.
INSERT INTO video_course_grade_targets (video_course_id, grade_id) VALUES
    ('10000000-0000-0000-0000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
    ('20000000-0000-0000-0000-000000000002', 'cccccccc-cccc-cccc-cccc-cccccccccddd'),
    ('50000000-0000-0000-0000-000000000005', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
    ('60000000-0000-0000-0000-000000000006', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
    ('70000000-0000-0000-0000-000000000007', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
    ('80000000-0000-0000-0000-000000000008', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

-- One confirmed booking — gives the student "enrolled" status with the
-- teacher for S4 and S8.
INSERT INTO course_bookings (student_id, course_id, teacher_id, study_year, status, booking_date)
SELECT 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
       'dddddddd-dddd-dddd-dddd-dddddddddddd',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       year,
       'confirmed',
       now()
  FROM academic_years WHERE is_active = TRUE LIMIT 1;

-- Whitelist for S6.
INSERT INTO video_course_free_students (video_course_id, student_id)
VALUES ('60000000-0000-0000-0000-000000000006',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Paid purchase for S7.
INSERT INTO video_course_purchases (
    id, video_course_id, student_id, teacher_id,
    amount_iqd, platform_commission_percent,
    platform_commission_iqd, teacher_net_iqd, status, paid_at
) VALUES (
    gen_random_uuid(),
    '70000000-0000-0000-0000-000000000007',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    50000, 15, 7500, 42500, 'paid', now()
);

-- ----------------------------------------------------------------------------
-- Run all 8 assertions in one shot. Each row is a (scenario, expected,
-- actual, pass) record.
-- ----------------------------------------------------------------------------
WITH cases AS (
    SELECT 1 AS n, 'public_free_by_grade + grade match'             AS scenario, TRUE  AS expected, '10000000-0000-0000-0000-000000000001'::uuid AS vid
    UNION ALL SELECT 2, 'public_free_by_grade + NO grade match',          FALSE, '20000000-0000-0000-0000-000000000002'::uuid
    UNION ALL SELECT 3, 'enrolled_students_free + NO booking',            FALSE, '30000000-0000-0000-0000-000000000003'::uuid
    UNION ALL SELECT 4, 'enrolled_students_free + confirmed booking',     TRUE,  '40000000-0000-0000-0000-000000000004'::uuid
    UNION ALL SELECT 5, 'marketplace_paid + no purchase + no whitelist',  FALSE, '50000000-0000-0000-0000-000000000005'::uuid
    UNION ALL SELECT 6, 'marketplace_paid + whitelisted',                 TRUE,  '60000000-0000-0000-0000-000000000006'::uuid
    UNION ALL SELECT 7, 'marketplace_paid + paid purchase',               TRUE,  '70000000-0000-0000-0000-000000000007'::uuid
    UNION ALL SELECT 8, 'marketplace_paid + free_for_enrolled + booking', TRUE,  '80000000-0000-0000-0000-000000000008'::uuid
)
SELECT
    n,
    scenario,
    expected,
    fn_student_can_view_video_course(
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', vid
    ) AS actual,
    CASE
        WHEN expected = fn_student_can_view_video_course(
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', vid
        )
        THEN '✓'
        ELSE '✗'
    END AS status
  FROM cases
 ORDER BY n;

-- Summary row.
WITH cases AS (
    SELECT 1 AS n, TRUE  AS expected, '10000000-0000-0000-0000-000000000001'::uuid AS vid
    UNION ALL SELECT 2, FALSE, '20000000-0000-0000-0000-000000000002'::uuid
    UNION ALL SELECT 3, FALSE, '30000000-0000-0000-0000-000000000003'::uuid
    UNION ALL SELECT 4, TRUE,  '40000000-0000-0000-0000-000000000004'::uuid
    UNION ALL SELECT 5, FALSE, '50000000-0000-0000-0000-000000000005'::uuid
    UNION ALL SELECT 6, TRUE,  '60000000-0000-0000-0000-000000000006'::uuid
    UNION ALL SELECT 7, TRUE,  '70000000-0000-0000-0000-000000000007'::uuid
    UNION ALL SELECT 8, TRUE,  '80000000-0000-0000-0000-000000000008'::uuid
), eval AS (
    SELECT
        n,
        expected,
        fn_student_can_view_video_course(
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', vid
        ) AS actual
      FROM cases
)
SELECT
    COUNT(*) FILTER (WHERE expected = actual)         AS passed,
    COUNT(*) FILTER (WHERE expected IS DISTINCT FROM actual) AS failed,
    COUNT(*)                                          AS total
  FROM eval;

-- Always rollback — seed data must not persist.
ROLLBACK;
