import bcrypt from 'bcryptjs';

import pool from '../config/database';

const STUDENT_EMAIL = 'review.student@mulhimiq.com';
const TEACHER_EMAIL = 'review.teacher@mulhimiq.com';
const DEFAULT_STUDENT_ID = 'a1100000-0000-4000-8000-000000000001';
const DEFAULT_TEACHER_ID = 'a1100000-0000-4000-8000-000000000002';

const IDS = {
  grade: 'a1100000-0000-4000-8000-000000000010',
  subject: 'a1100000-0000-4000-8000-000000000011',
  course: 'a1100000-0000-4000-8000-000000000012',
  session: 'a1100000-0000-4000-8000-000000000013',
  assignmentGraded: 'a1100000-0000-4000-8000-000000000014',
  assignmentUpcoming: 'a1100000-0000-4000-8000-000000000015',
  submission: 'a1100000-0000-4000-8000-000000000016',
  examGraded: 'a1100000-0000-4000-8000-000000000017',
  examUpcoming: 'a1100000-0000-4000-8000-000000000018',
  examGrade: 'a1100000-0000-4000-8000-000000000019',
  evaluation: 'a1100000-0000-4000-8000-000000000020',
  studentNotification: 'a1100000-0000-4000-8000-000000000021',
  teacherNotification: 'a1100000-0000-4000-8000-000000000022',
  walletTransaction: 'a1100000-0000-4000-8000-000000000023',
  walletLedger: 'a1100000-0000-4000-8000-000000000024',
};

type UserSeed = {
  id: string;
  name: string;
  email: string;
  userType: 'student' | 'teacher';
  passwordHash: string;
};

async function upsertUser(client: any, user: UserSeed): Promise<string> {
  const existing = await client.query(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [user.email],
  );
  const id = existing.rows[0]?.id ?? user.id;

  await client.query(
    `INSERT INTO users (
       id, name, email, password, user_type, status,
       phone, address, bio, experience_years,
       student_phone, parent_phone, school_name, gender, birth_date,
       latitude, longitude, formatted_address, country, city, state,
       email_verified, verification_code, verification_code_expires,
       password_reset_code, password_reset_expires,
       verification_code_attempts, password_reset_code_attempts,
       auth_provider, oauth_provider_id, deleted_at
     ) VALUES (
       $1, $2, $3, $4, $5, 'active',
       $6, $7, $8, $9,
       $10, $11, $12, $13, $14,
       33.31520000, 44.36610000, 'بغداد، العراق', 'العراق', 'بغداد', 'بغداد',
       TRUE, NULL, NULL, NULL, NULL, 0, 0, 'email', NULL, NULL
     )
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       email = EXCLUDED.email,
       password = EXCLUDED.password,
       user_type = EXCLUDED.user_type,
       status = 'active',
       phone = EXCLUDED.phone,
       address = EXCLUDED.address,
       bio = EXCLUDED.bio,
       experience_years = EXCLUDED.experience_years,
       student_phone = EXCLUDED.student_phone,
       parent_phone = EXCLUDED.parent_phone,
       school_name = EXCLUDED.school_name,
       gender = EXCLUDED.gender,
       birth_date = EXCLUDED.birth_date,
       latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude,
       formatted_address = EXCLUDED.formatted_address,
       country = EXCLUDED.country,
       city = EXCLUDED.city,
       state = EXCLUDED.state,
       email_verified = TRUE,
       verification_code = NULL,
       verification_code_expires = NULL,
       password_reset_code = NULL,
       password_reset_expires = NULL,
       verification_code_attempts = 0,
       password_reset_code_attempts = 0,
       auth_provider = 'email',
       oauth_provider_id = NULL,
       deleted_at = NULL`,
    user.userType === 'teacher'
      ? [
          id,
          user.name,
          user.email,
          user.passwordHash,
          user.userType,
          '07700000001',
          'بغداد - المنصور',
          'مدرس رياضيات بخبرة عملية في تدريس المرحلة الإعدادية.',
          8,
          null,
          null,
          null,
          null,
          null,
        ]
      : [
          id,
          user.name,
          user.email,
          user.passwordHash,
          user.userType,
          null,
          null,
          null,
          null,
          '07700000002',
          '07700000003',
          'ثانوية بغداد النموذجية',
          'male',
          '2008-03-15',
        ],
  );

  return id;
}

async function main(): Promise<void> {
  const password = process.env['APPLE_REVIEW_PASSWORD'];
  if (!password || password.length < 8) {
    throw new Error(
      'APPLE_REVIEW_PASSWORD is required and must contain at least 8 characters.',
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const activeYearResult = await client.query(
      `SELECT year FROM academic_years WHERE is_active = TRUE LIMIT 1`,
    );
    if (!activeYearResult.rows[0]?.year) {
      throw new Error(
        'No active academic year exists. Activate an academic year before seeding review accounts.',
      );
    }
    const studyYear = String(activeYearResult.rows[0].year);

    const studentId = await upsertUser(client, {
      id: DEFAULT_STUDENT_ID,
      name: 'علي حسن - حساب مراجعة Apple',
      email: STUDENT_EMAIL,
      userType: 'student',
      passwordHash,
    });
    const teacherId = await upsertUser(client, {
      id: DEFAULT_TEACHER_ID,
      name: 'أحمد كريم - مدرس الرياضيات',
      email: TEACHER_EMAIL,
      userType: 'teacher',
      passwordHash,
    });

    const requestedVideoCourseId =
      process.env['APPLE_REVIEW_VIDEO_COURSE_ID']?.trim() || null;
    const videoCourseResult = await client.query(
      `SELECT vc.id, vc.title, vc.access_type, vc.teacher_id,
              vcgt.grade_id
         FROM video_courses vc
         JOIN video_course_grade_targets vcgt
           ON vcgt.video_course_id = vc.id
        WHERE vc.deleted_at IS NULL
          AND vc.status = 'approved'
          AND vc.access_type IN ('public_free_by_grade', 'marketplace_paid')
          AND ($1::uuid IS NULL OR vc.id = $1::uuid)
          AND EXISTS (
            SELECT 1 FROM video_lessons vl
             WHERE vl.course_id = vc.id
               AND vl.deleted_at IS NULL
               AND vl.bunny_status = 'ready'
          )
        ORDER BY
          CASE WHEN vc.access_type = 'public_free_by_grade' THEN 0 ELSE 1 END,
          vc.created_at DESC
        LIMIT 1`,
      [requestedVideoCourseId],
    );
    const videoCourse = videoCourseResult.rows[0];
    if (!videoCourse) {
      throw new Error(
        requestedVideoCourseId
          ? `Video course ${requestedVideoCourseId} is not approved, grade-targeted, or does not contain a ready lesson.`
          : 'No approved grade-targeted video course with a ready lesson exists. Set APPLE_REVIEW_VIDEO_COURSE_ID after preparing one.',
      );
    }

    const gradeId = String(videoCourse.grade_id);
    const gradeResult = await client.query(
      `SELECT id FROM grades WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [gradeId],
    );
    if (!gradeResult.rows[0]) {
      throw new Error('The selected video course targets an unavailable grade.');
    }

    await client.query(
      `INSERT INTO student_grades
         (id, student_id, grade_id, study_year, is_active, deleted_at)
       VALUES ($1, $2, $3, $4, TRUE, NULL)
       ON CONFLICT (student_id, grade_id, study_year) DO UPDATE SET
         is_active = TRUE, deleted_at = NULL, updated_at = NOW()`,
      [IDS.grade, studentId, gradeId, studyYear],
    );
    await client.query(
      `INSERT INTO teacher_grades
         (id, teacher_id, grade_id, study_year, is_active, deleted_at)
       VALUES ($1, $2, $3, $4, TRUE, NULL)
       ON CONFLICT (teacher_id, grade_id, study_year) DO UPDATE SET
         is_active = TRUE, deleted_at = NULL, updated_at = NOW()`,
      [IDS.grade.replace(/10$/, '30'), teacherId, gradeId, studyYear],
    );

    const existingSubject = await client.query(
      `SELECT id FROM subjects
        WHERE teacher_id = $1 AND name = $2 AND deleted_at IS NULL LIMIT 1`,
      [teacherId, 'الرياضيات'],
    );
    const subjectId = existingSubject.rows[0]?.id ?? IDS.subject;
    if (!existingSubject.rows[0]) {
      await client.query(
        `INSERT INTO subjects (id, teacher_id, name, description)
         VALUES ($1, $2, 'الرياضيات', 'مادة الرياضيات للمرحلة الإعدادية')`,
        [subjectId, teacherId],
      );
    }

    const existingCourse = await client.query(
      `SELECT id FROM courses
        WHERE teacher_id = $1
          AND study_year = $2
          AND grade_id = $3
          AND subject_id = $4
          AND course_name = $5
          AND is_deleted = FALSE
        LIMIT 1`,
      [
        teacherId,
        studyYear,
        gradeId,
        subjectId,
        'الرياضيات التطبيقية - حساب المراجعة',
      ],
    );
    const courseId = existingCourse.rows[0]?.id ?? IDS.course;
    if (!existingCourse.rows[0]) {
      await client.query(
        `INSERT INTO courses (
           id, teacher_id, study_year, grade_id, subject_id, course_name,
           description, start_date, end_date, price, seats_count,
           has_reservation, reservation_amount, is_deleted
         ) VALUES (
           $1, $2, $3, $4, $5, 'الرياضيات التطبيقية - حساب المراجعة',
           'دورة متكاملة تتضمن جلسات وواجبات وامتحانات وتقييمات.',
           CURRENT_DATE - 30, CURRENT_DATE + 180, 150000, 25,
           FALSE, NULL, FALSE
         )`,
        [courseId, teacherId, studyYear, gradeId, subjectId],
      );
    }

    await client.query(
      `INSERT INTO course_bookings (
         student_id, course_id, teacher_id, study_year, status,
         approved_at, student_message, teacher_response, is_deleted
       ) VALUES (
         $1, $2, $3, $4, 'confirmed', NOW() - INTERVAL '20 days',
         'أرغب بالانضمام إلى دورة المراجعة الشاملة.',
         'تم قبول انضمامك، أهلًا بك في الدورة.', FALSE
       )
       ON CONFLICT (student_id, course_id) DO UPDATE SET
         teacher_id = EXCLUDED.teacher_id,
         study_year = EXCLUDED.study_year,
         status = 'confirmed',
         approved_at = EXCLUDED.approved_at,
         student_message = EXCLUDED.student_message,
         teacher_response = EXCLUDED.teacher_response,
         is_deleted = FALSE,
         updated_at = NOW()`,
      [studentId, courseId, teacherId, studyYear],
    );

    await client.query(
      `INSERT INTO sessions (
         id, course_id, teacher_id, title, weekday, start_time, end_time,
         recurrence, flex_type, flex_minutes, state, is_deleted
       ) VALUES (
         $1, $2, $3, 'المحاضرة الأسبوعية - حل المسائل',
         6, '16:00', '17:30', TRUE, 'window', 15, 'confirmed', FALSE
       )
       ON CONFLICT (id) DO UPDATE SET
         course_id = EXCLUDED.course_id,
         teacher_id = EXCLUDED.teacher_id,
         title = EXCLUDED.title,
         state = 'confirmed',
         is_deleted = FALSE`,
      [IDS.session, courseId, teacherId],
    );
    await client.query(
      `INSERT INTO session_attendees (session_id, student_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [IDS.session, studentId],
    );

    await client.query(
      `INSERT INTO assignments (
         id, course_id, subject_id, session_id, teacher_id, title, description,
         assigned_date, due_date, submission_type, max_score, is_active,
         visibility, study_year, grade_id, created_by, deleted_at
       ) VALUES
       ($1, $3, $4, $5, $6, 'واجب المعادلات التفاضلية',
        'حل الأسئلة من 1 إلى 5 مع توضيح خطوات الحل.',
        NOW() - INTERVAL '12 days', NOW() - INTERVAL '5 days',
        'text', 100, TRUE, 'all_students', $7, $8, $6, NULL),
       ($2, $3, $4, $5, $6, 'واجب المراجعة الأسبوعية',
        'حل مجموعة المراجعة ورفع الإجابات قبل الموعد.',
        NOW() - INTERVAL '1 day', NOW() + INTERVAL '6 days',
        'mixed', 100, TRUE, 'all_students', $7, $8, $6, NULL)
       ON CONFLICT (id) DO UPDATE SET
         course_id = EXCLUDED.course_id,
         subject_id = EXCLUDED.subject_id,
         session_id = EXCLUDED.session_id,
         teacher_id = EXCLUDED.teacher_id,
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         assigned_date = EXCLUDED.assigned_date,
         due_date = EXCLUDED.due_date,
         study_year = EXCLUDED.study_year,
         grade_id = EXCLUDED.grade_id,
         is_active = TRUE,
         deleted_at = NULL`,
      [
        IDS.assignmentGraded,
        IDS.assignmentUpcoming,
        courseId,
        subjectId,
        IDS.session,
        teacherId,
        studyYear,
        gradeId,
      ],
    );
    await client.query(
      `INSERT INTO assignment_submissions (
         id, assignment_id, student_id, submitted_at, status, content_text,
         score, graded_at, graded_by, feedback
       ) VALUES (
         $1, $2, $3, NOW() - INTERVAL '7 days', 'graded',
         'تم حل جميع الأسئلة وإرفاق خطوات الحل بالتفصيل.',
         92, NOW() - INTERVAL '6 days', $4,
         'إجابة ممتازة، راجع فقط ترتيب الخطوات في السؤال الرابع.'
       )
       ON CONFLICT (assignment_id, student_id) DO UPDATE SET
         submitted_at = EXCLUDED.submitted_at,
         status = 'graded',
         content_text = EXCLUDED.content_text,
         score = 92,
         graded_at = EXCLUDED.graded_at,
         graded_by = EXCLUDED.graded_by,
         feedback = EXCLUDED.feedback,
         updated_at = NOW()`,
      [IDS.submission, IDS.assignmentGraded, studentId, teacherId],
    );

    await client.query(
      `INSERT INTO exams (
         id, course_id, subject_id, teacher_id, exam_date, exam_type,
         max_score, description, notes
       ) VALUES
       ($1, $3, $4, $5, NOW() - INTERVAL '10 days', 'monthly', 100,
        'اختبار شهري في التفاضل والتكامل.', 'تم تصحيح الاختبار وإعلان الدرجة.'),
       ($2, $3, $4, $5, NOW() + INTERVAL '10 days', 'daily', 20,
        'اختبار قصير في موضوع المحاضرة القادمة.', 'مدة الاختبار 20 دقيقة.')
       ON CONFLICT (id) DO UPDATE SET
         course_id = EXCLUDED.course_id,
         subject_id = EXCLUDED.subject_id,
         teacher_id = EXCLUDED.teacher_id,
         exam_date = EXCLUDED.exam_date,
         exam_type = EXCLUDED.exam_type,
         max_score = EXCLUDED.max_score,
         description = EXCLUDED.description,
         notes = EXCLUDED.notes`,
      [IDS.examGraded, IDS.examUpcoming, courseId, subjectId, teacherId],
    );
    await client.query(
      `INSERT INTO exam_sessions (exam_id, session_id)
       VALUES ($1, $3), ($2, $3)
       ON CONFLICT DO NOTHING`,
      [IDS.examGraded, IDS.examUpcoming, IDS.session],
    );
    await client.query(
      `INSERT INTO exam_grades (id, exam_id, student_id, score, graded_at, graded_by)
       VALUES ($1, $2, $3, 88, NOW() - INTERVAL '9 days', $4)
       ON CONFLICT (exam_id, student_id) DO UPDATE SET
         score = 88, graded_at = EXCLUDED.graded_at, graded_by = EXCLUDED.graded_by`,
      [IDS.examGrade, IDS.examGraded, studentId, teacherId],
    );

    await client.query(
      `INSERT INTO student_evaluations (
         id, student_id, teacher_id, eval_date, eval_date_date,
         scientific_level, behavioral_level, attendance_level,
         homework_preparation, participation_level, instruction_following,
         guidance, notes
       ) VALUES (
         $1, $2, $3, TIMESTAMPTZ '2026-06-14 12:00:00+03', DATE '2026-06-14',
         'very_good', 'excellent', 'excellent',
         'very_good', 'very_good', 'excellent',
         'استمر على نفس مستوى الالتزام وركّز على سرعة الحل.',
         'طالب ملتزم ومتفاعل في المحاضرات.'
       )
       ON CONFLICT (student_id, teacher_id, eval_date_date) DO UPDATE SET
         scientific_level = EXCLUDED.scientific_level,
         behavioral_level = EXCLUDED.behavioral_level,
         attendance_level = EXCLUDED.attendance_level,
         homework_preparation = EXCLUDED.homework_preparation,
         participation_level = EXCLUDED.participation_level,
         instruction_following = EXCLUDED.instruction_following,
         guidance = EXCLUDED.guidance,
         notes = EXCLUDED.notes,
         updated_at = NOW()`,
      [IDS.evaluation, studentId, teacherId],
    );

    await client.query(
      `INSERT INTO notifications (
         id, title, message, type, priority, status, recipient_type,
         recipient_ids, data, study_year, scheduled_at, sent_at, created_by
       ) VALUES
       ($1, 'تم تقييم واجبك',
        'حصلت على 92 من 100 في واجب المعادلات التفاضلية.',
        'grade_update', 'high', 'delivered', 'specific_students',
        jsonb_build_array($3::text),
        jsonb_build_object('assignmentId', $5::text, 'courseId', $6::text),
        $7, NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days', $4),
       ($2, 'ملخص أداء دورة المراجعة',
        'يوجد واجب جديد واختبار قادم للطالب المسجل في الدورة.',
        'system_announcement', 'medium', 'delivered', 'specific_teachers',
        jsonb_build_array($4::text),
        jsonb_build_object('courseId', $6::text, 'subType', 'apple_review'),
        $7, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', $4)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         message = EXCLUDED.message,
         status = 'delivered',
         recipient_ids = EXCLUDED.recipient_ids,
         data = EXCLUDED.data,
         study_year = EXCLUDED.study_year,
         sent_at = EXCLUDED.sent_at,
         deleted_at = NULL`,
      [
        IDS.studentNotification,
        IDS.teacherNotification,
        studentId,
        teacherId,
        IDS.assignmentGraded,
        courseId,
        studyYear,
      ],
    );
    await client.query(
      `INSERT INTO user_notifications (user_id, notification_id, read_at)
       VALUES ($1, $3, NULL), ($2, $4, NULL)
       ON CONFLICT (user_id, notification_id) DO UPDATE SET read_at = NULL`,
      [
        studentId,
        teacherId,
        IDS.studentNotification,
        IDS.teacherNotification,
      ],
    );

    await client.query(
      `INSERT INTO teacher_wallets (
         teacher_id, balance, pending_balance, withdrawable_balance,
         lifetime_earnings, lifetime_withdrawn
       ) VALUES ($1, 125000, 75000, 0, 75000, 0)
       ON CONFLICT (teacher_id) DO UPDATE SET
         balance = 125000,
         pending_balance = 75000,
         withdrawable_balance = 0,
         lifetime_earnings = GREATEST(teacher_wallets.lifetime_earnings, 75000),
         updated_at = NOW()`,
      [teacherId],
    );
    await client.query(
      `INSERT INTO teacher_wallet_transactions (
         id, teacher_id, txn_type, amount, balance_before, balance_after,
         reference_type, reference_id, created_at
       ) VALUES (
         $1, $2, 'credit', 125000, 0, 125000,
         'apple_review_demo', 'apple-review-initial-balance',
         NOW() - INTERVAL '15 days'
       )
       ON CONFLICT (id) DO NOTHING`,
      [IDS.walletTransaction, teacherId],
    );
    await client.query(
      `INSERT INTO wallet_ledger (
         id, teacher_id, entry_type, amount,
         balance_pending_after, balance_withdrawable_after,
         actor_user_id, idempotency_key, notes, created_at
       ) VALUES (
         $1, $2, 'video_course_purchase_credit', 75000,
         75000, 0, $2, 'apple-review-video-credit',
         'رصيد تجريبي لحساب مراجعة App Store', NOW() - INTERVAL '8 days'
       )
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [IDS.walletLedger, teacherId],
    );

    await client.query(
      `INSERT INTO video_course_free_students (
         video_course_id, student_id, granted_at, granted_by, reason
       ) VALUES (
         $1, $2, NOW() - INTERVAL '14 days', $3,
         'وصول دائم لحساب مراجعة App Store'
       )
       ON CONFLICT (video_course_id, student_id) DO UPDATE SET
         granted_by = EXCLUDED.granted_by,
         reason = EXCLUDED.reason`,
      [videoCourse.id, studentId, teacherId],
    );

    const accessResult = await client.query(
      `SELECT fn_student_can_view_video_course($1, $2) AS can_view`,
      [studentId, videoCourse.id],
    );
    if (accessResult.rows[0]?.can_view !== true) {
      throw new Error(
        'The review student was created, but video-course access verification failed.',
      );
    }

    const verificationResult = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM users
           WHERE id IN ($1, $2)
             AND status = 'active'
             AND email_verified = TRUE
             AND verification_code IS NULL) AS active_users,
         (SELECT COUNT(*)::int FROM course_bookings
           WHERE student_id = $1 AND teacher_id = $2
             AND status = 'confirmed' AND is_deleted = FALSE) AS bookings,
         (SELECT COUNT(*)::int FROM assignments
           WHERE teacher_id = $2 AND course_id = $3
             AND is_active = TRUE AND deleted_at IS NULL) AS assignments,
         (SELECT COUNT(*)::int FROM assignment_submissions
           WHERE student_id = $1 AND status = 'graded') AS graded_assignments,
         (SELECT COUNT(*)::int FROM exams
           WHERE teacher_id = $2 AND course_id = $3) AS exams,
         (SELECT COUNT(*)::int FROM exam_grades
           WHERE student_id = $1) AS exam_grades,
         (SELECT COUNT(*)::int FROM student_evaluations
           WHERE student_id = $1 AND teacher_id = $2) AS evaluations,
         (SELECT COUNT(*)::int FROM notifications
           WHERE id IN ($4, $5)
             AND status IN ('sent', 'delivered', 'read')
             AND deleted_at IS NULL) AS notifications,
         (SELECT COUNT(*)::int FROM teacher_wallets
           WHERE teacher_id = $2
             AND balance > 0 AND pending_balance > 0) AS wallets,
         (SELECT COUNT(*)::int FROM video_lessons
           WHERE course_id = $6
             AND bunny_status = 'ready'
             AND deleted_at IS NULL) AS ready_video_lessons`,
      [
        studentId,
        teacherId,
        courseId,
        IDS.studentNotification,
        IDS.teacherNotification,
        videoCourse.id,
      ],
    );
    const verification = verificationResult.rows[0];
    const valid =
      verification.active_users === 2 &&
      verification.bookings >= 1 &&
      verification.assignments >= 2 &&
      verification.graded_assignments >= 1 &&
      verification.exams >= 2 &&
      verification.exam_grades >= 1 &&
      verification.evaluations >= 1 &&
      verification.notifications >= 2 &&
      verification.wallets >= 1 &&
      verification.ready_video_lessons >= 1;
    if (!valid) {
      throw new Error(
        `Apple Review data validation failed: ${JSON.stringify(verification)}`,
      );
    }

    await client.query('COMMIT');

    console.log(
      JSON.stringify(
        {
          student: { id: studentId, email: STUDENT_EMAIL },
          teacher: { id: teacherId, email: TEACHER_EMAIL },
          studyYear,
          liveCourseId: courseId,
          videoCourse: {
            id: videoCourse.id,
            title: videoCourse.title,
            accessType: videoCourse.access_type,
          },
          otpRequiredOnLogin: false,
          verification,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Failed to seed Apple Review accounts:', error);
  process.exit(1);
});
