-- ============================================================================
-- wipe_test_accounts.sql
-- Hard-delete MulhimIQ test accounts + ALL related rows so both emails
-- can re-register as brand-new empty accounts.
--
-- Targets:
--   Teacher: www.sjad.n@gmail.com
--   Student: mulhimiq@gmail.com
--
-- Usage (on the server, against the API Postgres DB):
--
--   # If Postgres is on the host:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f wipe_test_accounts.sql
--
--   # Or with discrete args:
--   psql -h localhost -U postgres -d dirasiq_db -v ON_ERROR_STOP=1 -f wipe_test_accounts.sql
--
--   # If the API DB runs in Docker (adjust container name):
--   docker exec -i <postgres_container> \
--     psql -U postgres -d dirasiq_db -v ON_ERROR_STOP=1 < wipe_test_accounts.sql
--
-- IRREVERSIBLE. Take a backup first if unsure:
--   pg_dump -Fc -f /tmp/before_wipe.dump <db>
-- ============================================================================

BEGIN;

DO $$
DECLARE
  tid UUID;
  sid UUID;
  admin_id UUID;
BEGIN
  SELECT id INTO tid
    FROM users
   WHERE email = 'www.sjad.n@gmail.com'
   LIMIT 1;

  SELECT id INTO sid
    FROM users
   WHERE email = 'mulhimiq@gmail.com'
   LIMIT 1;

  RAISE NOTICE 'teacher id = %', tid;
  RAISE NOTICE 'student id = %', sid;

  IF tid IS NULL AND sid IS NULL THEN
    RAISE NOTICE 'Nothing to wipe — both emails already absent.';
    RETURN;
  END IF;

  IF tid IS NOT NULL AND EXISTS (
    SELECT 1 FROM users WHERE id = tid AND user_type <> 'teacher'
  ) THEN
    RAISE EXCEPTION 'www.sjad.n@gmail.com exists but is not a teacher';
  END IF;

  IF sid IS NOT NULL AND EXISTS (
    SELECT 1 FROM users WHERE id = sid AND user_type <> 'student'
  ) THEN
    RAISE EXCEPTION 'mulhimiq@gmail.com exists but is not a student';
  END IF;

  -- 1) Commission overrides (set_by is RESTRICT + NOT NULL)
  IF tid IS NOT NULL THEN
    SELECT id INTO admin_id
      FROM users
     WHERE user_type = 'super_admin'
       AND deleted_at IS NULL
       AND id <> tid
     ORDER BY created_at ASC
     LIMIT 1;

    IF admin_id IS NOT NULL THEN
      UPDATE teacher_commission_overrides
         SET set_by = admin_id
       WHERE set_by = tid AND teacher_id <> tid;
    ELSE
      DELETE FROM teacher_commission_overrides
       WHERE set_by = tid AND teacher_id <> tid;
    END IF;

    DELETE FROM teacher_commission_overrides WHERE teacher_id = tid;
  END IF;

  -- 2) Advertisements
  DELETE FROM advertisement_clicks
   WHERE (sid IS NOT NULL AND student_id = sid)
      OR (tid IS NOT NULL AND advertisement_id IN (
            SELECT id FROM advertisements WHERE teacher_id = tid
          ));

  IF tid IS NOT NULL THEN
    DELETE FROM advertisement_wallet_transactions
     WHERE teacher_id = tid
        OR advertisement_id IN (
             SELECT id FROM advertisements WHERE teacher_id = tid
           );
    DELETE FROM advertisements WHERE teacher_id = tid;
  END IF;

  -- 3) Video purchases / free whitelist
  DELETE FROM video_course_purchases
   WHERE (tid IS NOT NULL AND teacher_id = tid)
      OR (sid IS NOT NULL AND student_id = sid);

  DELETE FROM video_course_free_students
   WHERE (sid IS NOT NULL AND student_id = sid)
      OR (tid IS NOT NULL AND granted_by = tid)
      OR (sid IS NOT NULL AND granted_by = sid)
      OR (tid IS NOT NULL AND video_course_id IN (
            SELECT id FROM video_courses WHERE teacher_id = tid
          ));

  -- 4) First-students free commission
  DELETE FROM teacher_commission_free_students
   WHERE (tid IS NOT NULL AND teacher_id = tid)
      OR (sid IS NOT NULL AND student_id = sid);

  -- 5) Wallet stack
  IF tid IS NOT NULL THEN
    DELETE FROM wallet_ledger WHERE teacher_id = tid;
    DELETE FROM teacher_withdrawal_requests WHERE teacher_id = tid;
    DELETE FROM teacher_wallet_transactions WHERE teacher_id = tid;
    DELETE FROM teacher_wallets WHERE teacher_id = tid;
  END IF;

  -- 6) Wayl
  IF tid IS NOT NULL THEN
    DELETE FROM wayl_payment_links WHERE teacher_id = tid;
  END IF;

  -- 7) Invoices
  DELETE FROM invoice_installments
   WHERE invoice_id IN (
     SELECT id FROM course_invoices
      WHERE (tid IS NOT NULL AND teacher_id = tid)
         OR (sid IS NOT NULL AND student_id = sid)
   );

  DELETE FROM course_invoices
   WHERE (tid IS NOT NULL AND teacher_id = tid)
      OR (sid IS NOT NULL AND student_id = sid);

  -- 8) Academic tree
  DELETE FROM assignment_submissions
   WHERE (sid IS NOT NULL AND student_id = sid)
      OR (tid IS NOT NULL AND assignment_id IN (
            SELECT id FROM assignments WHERE teacher_id = tid
          ));

  DELETE FROM assignment_recipients
   WHERE (sid IS NOT NULL AND student_id = sid)
      OR (tid IS NOT NULL AND assignment_id IN (
            SELECT id FROM assignments WHERE teacher_id = tid
          ));

  DELETE FROM exam_grades
   WHERE (sid IS NOT NULL AND student_id = sid)
      OR (tid IS NOT NULL AND exam_id IN (
            SELECT id FROM exams WHERE teacher_id = tid
          ));

  IF tid IS NOT NULL THEN
    DELETE FROM exam_sessions
     WHERE exam_id IN (SELECT id FROM exams WHERE teacher_id = tid);
    DELETE FROM assignments WHERE teacher_id = tid;
    DELETE FROM exams WHERE teacher_id = tid;
  END IF;

  DELETE FROM session_attendance
   WHERE (tid IS NOT NULL AND teacher_id = tid)
      OR (sid IS NOT NULL AND student_id = sid);

  DELETE FROM student_evaluations
   WHERE (tid IS NOT NULL AND teacher_id = tid)
      OR (sid IS NOT NULL AND student_id = sid);

  DELETE FROM session_conflicts
   WHERE (sid IS NOT NULL AND student_id = sid)
      OR (tid IS NOT NULL AND session_id IN (SELECT id FROM sessions WHERE teacher_id = tid))
      OR (tid IS NOT NULL AND other_session_id IN (SELECT id FROM sessions WHERE teacher_id = tid));

  DELETE FROM session_attendees
   WHERE (sid IS NOT NULL AND student_id = sid)
      OR (tid IS NOT NULL AND session_id IN (SELECT id FROM sessions WHERE teacher_id = tid));

  IF tid IS NOT NULL THEN
    DELETE FROM session_holds
     WHERE session_id IN (SELECT id FROM sessions WHERE teacher_id = tid)
        OR created_by IN (tid, sid);
    DELETE FROM session_audit
     WHERE session_id IN (SELECT id FROM sessions WHERE teacher_id = tid)
        OR created_by IN (tid, sid);
    DELETE FROM sessions WHERE teacher_id = tid;
  ELSIF sid IS NOT NULL THEN
    DELETE FROM session_holds WHERE created_by = sid;
    DELETE FROM session_audit WHERE created_by = sid;
  END IF;

  DELETE FROM reservation_payments
   WHERE (tid IS NOT NULL AND teacher_id = tid)
      OR (sid IS NOT NULL AND student_id = sid);

  DELETE FROM course_bookings
   WHERE (tid IS NOT NULL AND teacher_id = tid)
      OR (sid IS NOT NULL AND student_id = sid);

  IF tid IS NOT NULL THEN
    DELETE FROM video_course_target_courses
     WHERE video_course_id IN (SELECT id FROM video_courses WHERE teacher_id = tid)
        OR course_id IN (SELECT id FROM courses WHERE teacher_id = tid);

    DELETE FROM video_course_grade_targets
     WHERE video_course_id IN (SELECT id FROM video_courses WHERE teacher_id = tid);

    DELETE FROM video_lessons
     WHERE course_id IN (SELECT id FROM video_courses WHERE teacher_id = tid);

    DELETE FROM video_courses WHERE teacher_id = tid;
    DELETE FROM courses WHERE teacher_id = tid;
    DELETE FROM subjects WHERE teacher_id = tid;
    DELETE FROM teacher_grades WHERE teacher_id = tid;
    DELETE FROM teacher_expenses WHERE teacher_id = tid;

    DELETE FROM teacher_referrals
     WHERE referrer_teacher_id = tid OR referred_teacher_id = tid;
  END IF;

  IF sid IS NOT NULL THEN
    DELETE FROM student_grades WHERE student_id = sid;
  END IF;

  -- 9) Notifications / tokens
  IF tid IS NOT NULL OR sid IS NOT NULL THEN
    DELETE FROM user_notifications
     WHERE (tid IS NOT NULL AND user_id = tid)
        OR (sid IS NOT NULL AND user_id = sid);

    DELETE FROM notifications
     WHERE (tid IS NOT NULL AND created_by = tid)
        OR (sid IS NOT NULL AND created_by = sid);

    DELETE FROM notification_templates
     WHERE (tid IS NOT NULL AND created_by = tid)
        OR (sid IS NOT NULL AND created_by = sid);

    DELETE FROM tokens
     WHERE (tid IS NOT NULL AND user_id = tid)
        OR (sid IS NOT NULL AND user_id = sid);
  END IF;

  -- 10) Email-keyed leftovers
  DELETE FROM account_deletion_requests
   WHERE email IN ('www.sjad.n@gmail.com', 'mulhimiq@gmail.com');

  DELETE FROM teacher_application_files
   WHERE application_id IN (
     SELECT id FROM teacher_applications
      WHERE email IN ('www.sjad.n@gmail.com', 'mulhimiq@gmail.com')
   );

  DELETE FROM teacher_application_grades
   WHERE application_id IN (
     SELECT id FROM teacher_applications
      WHERE email IN ('www.sjad.n@gmail.com', 'mulhimiq@gmail.com')
   );

  DELETE FROM teacher_applications
   WHERE email IN ('www.sjad.n@gmail.com', 'mulhimiq@gmail.com');

  -- 11) Users last
  DELETE FROM users
   WHERE (tid IS NOT NULL AND id = tid)
      OR (sid IS NOT NULL AND id = sid);

  RAISE NOTICE 'Wipe complete. Both emails are free to re-register.';
END $$;

COMMIT;
