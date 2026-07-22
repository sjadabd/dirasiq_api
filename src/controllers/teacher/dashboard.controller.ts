import type { Request, Response } from 'express';

import pool from '../../config/database';
import { BookingStatus } from '../../types';
import { ok } from '../../utils/response.util';
import { formatTime12Arabic } from '../../utils/time-format.util';

export class TeacherDashboardController {
  // GET /api/teacher/dashboard
  static async getDashboard(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;

    const queries = {
      totalCourses: `
        SELECT COUNT(*)::int AS count
          FROM courses
         WHERE teacher_id = $1 AND is_deleted = false
      `,
      activeCourses: `
        SELECT COUNT(*)::int AS count
          FROM courses
         WHERE teacher_id = $1
           AND is_deleted = false
           AND end_date >= CURRENT_DATE
      `,
      totalStudents: `
        SELECT COUNT(DISTINCT student_id)::int AS count
          FROM course_bookings
         WHERE teacher_id = $1
           AND is_deleted = false
      `,
      activeStudents: `
        SELECT COUNT(DISTINCT student_id)::int AS count
          FROM course_bookings
         WHERE teacher_id = $1
           AND is_deleted = false
           AND status = $2
      `,
      sessionsToday: `
        SELECT COUNT(*)::int AS count
          FROM sessions
         WHERE teacher_id = $1
           AND is_deleted = false
           AND weekday = EXTRACT(DOW FROM (NOW() AT TIME ZONE 'Asia/Baghdad'))::int
      `,
      depositsTotals: `
        SELECT
          COALESCE(SUM(amount), 0)::float AS total_deposit,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0)::float AS received_deposit
        FROM reservation_payments
        WHERE teacher_id = $1
      `,
      studentInvoicesTotals: `
        SELECT
          COALESCE(SUM(amount_due), 0)::float AS total_due,
          COALESCE(SUM(amount_paid), 0)::float AS amount_paid,
          COALESCE(SUM(CASE
            WHEN invoice_status IN ('pending', 'partial', 'overdue')
              THEN remaining_amount
            ELSE 0
          END), 0)::float AS amount_remaining
        FROM course_invoices
        WHERE teacher_id = $1 AND deleted_at IS NULL
      `,
    } as const;

    const [
      totalCoursesR,
      activeCoursesR,
      totalStudentsR,
      activeStudentsR,
      sessionsTodayR,
      depositsTotalsR,
      studentInvoicesTotalsR,
    ] = await Promise.all([
      pool.query(queries.totalCourses, [teacherId]),
      pool.query(queries.activeCourses, [teacherId]),
      pool.query(queries.totalStudents, [teacherId]),
      pool.query(queries.activeStudents, [teacherId, BookingStatus.CONFIRMED]),
      pool.query(queries.sessionsToday, [teacherId]),
      pool.query(queries.depositsTotals, [teacherId]),
      pool.query(queries.studentInvoicesTotals, [teacherId]),
    ]);

    const totalDeposit = Number(depositsTotalsR.rows[0]?.total_deposit ?? 0);
    const receivedDeposit = Number(depositsTotalsR.rows[0]?.received_deposit ?? 0);
    const remainingDeposit = Math.max(0, totalDeposit - receivedDeposit);

    res.status(200).json(
      ok(
        {
          totalStudents: totalStudentsR.rows[0]?.count ?? 0,
          totalCourses: totalCoursesR.rows[0]?.count ?? 0,
          activeStudents: activeStudentsR.rows[0]?.count ?? 0,
          activeCourses: activeCoursesR.rows[0]?.count ?? 0,
          sessionsToday: sessionsTodayR.rows[0]?.count ?? 0,
          totalDeposit,
          receivedDeposit,
          remainingDeposit,
          depositInvoices: {
            totalAmount: totalDeposit,
            receivedAmount: receivedDeposit,
            remainingAmount: remainingDeposit,
          },
          studentInvoices: {
            totalDue: Number(studentInvoicesTotalsR.rows[0]?.total_due ?? 0),
            amountPaid: Number(studentInvoicesTotalsR.rows[0]?.amount_paid ?? 0),
            amountRemaining: Number(studentInvoicesTotalsR.rows[0]?.amount_remaining ?? 0),
          },
        },
        'بيانات لوحة التحكم للمعلم'
      )
    );
  }

  // GET /api/teacher/dashboard/upcoming-today
  static async getTodayUpcomingSessions(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const r = await pool.query(
      `SELECT
         s.id,
         s.course_id,
         s.teacher_id,
         s.title,
         s.weekday,
         s.start_time,
         s.end_time,
         s.state,
         c.course_name,
         (s.end_time < (NOW() AT TIME ZONE 'Asia/Baghdad')::time) AS is_past
       FROM sessions s
       JOIN courses c ON c.id = s.course_id
       WHERE s.teacher_id = $1
         AND s.is_deleted = false
         AND c.is_deleted = false
         AND s.weekday = EXTRACT(DOW FROM (NOW() AT TIME ZONE 'Asia/Baghdad'))::int
         AND s.state IN ('draft','proposed','conflict','confirmed','negotiating')
       ORDER BY s.start_time ASC`,
      [teacherId]
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const items = r.rows.map((row: any) => {
      const [sh, sm, ss] = String(row.start_time).split(':').map((x: string) => parseInt(x, 10));
      const [eh, em, es] = String(row.end_time).split(':').map((x: string) => parseInt(x, 10));
      const startAt = new Date(today);
      startAt.setHours(sh || 0, sm || 0, ss || 0, 0);
      const endAt = new Date(today);
      endAt.setHours(eh || 0, em || 0, es || 0, 0);
      return {
        sessionId: String(row.id),
        courseId: String(row.course_id),
        courseName: String(row.course_name),
        title: row.title || null,
        startTime: formatTime12Arabic(row.start_time),
        endTime: formatTime12Arabic(row.end_time),
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        state: row.state,
        isPast: Boolean(row.is_past),
      };
    });

    res.status(200).json(ok(items, 'حصص اليوم', { count: items.length }));
  }

  // GET /api/teacher/dashboard/performance
  static async getPerformance(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;

    const [attendanceR, homeworkR, collectionR] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (
             WHERE a.meta->>'status' = 'present'
                OR (a.meta->>'status' IS NULL AND a.checkin_at IS NOT NULL)
           )::int AS present
         FROM session_attendance a
         JOIN sessions s ON s.id = a.session_id
         WHERE s.teacher_id = $1
           AND s.is_deleted = false
           AND a.checkin_at >= date_trunc('month', (NOW() AT TIME ZONE 'Asia/Baghdad'))`,
        [teacherId]
      ),
      pool.query(
        `WITH month_assignments AS (
           SELECT a.id, a.course_id, a.visibility
             FROM assignments a
            WHERE a.teacher_id = $1
              AND a.deleted_at IS NULL
              AND a.assigned_date >= date_trunc('month', (NOW() AT TIME ZONE 'Asia/Baghdad'))
         ),
         expected AS (
           SELECT COUNT(*)::int AS c FROM (
             SELECT ma.id, cb.student_id
               FROM month_assignments ma
               JOIN course_bookings cb
                 ON cb.course_id = ma.course_id
                AND cb.is_deleted = false
                AND cb.status IN ('confirmed', 'approved', 'enrolled')
              WHERE ma.visibility = 'all_students'
             UNION
             SELECT ma.id, ar.student_id
               FROM month_assignments ma
               JOIN assignment_recipients ar ON ar.assignment_id = ma.id
              WHERE ma.visibility = 'specific_students'
           ) x
         ),
         submitted AS (
           SELECT COUNT(*)::int AS c
             FROM month_assignments ma
             JOIN assignment_submissions asub ON asub.assignment_id = ma.id
            WHERE asub.submitted_at IS NOT NULL
         )
         SELECT
           COALESCE((SELECT c FROM expected), 0) AS expected,
           COALESCE((SELECT c FROM submitted), 0) AS submitted`,
        [teacherId]
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(amount_due), 0)::float AS total_due,
           COALESCE(SUM(amount_paid), 0)::float AS amount_paid
         FROM course_invoices
         WHERE teacher_id = $1
           AND deleted_at IS NULL`,
        [teacherId]
      ),
    ]);

    const attTotal = Number(attendanceR.rows[0]?.total ?? 0);
    const attPresent = Number(attendanceR.rows[0]?.present ?? 0);
    const hwExpected = Number(homeworkR.rows[0]?.expected ?? 0);
    const hwSubmitted = Number(homeworkR.rows[0]?.submitted ?? 0);
    const totalDue = Number(collectionR.rows[0]?.total_due ?? 0);
    const amountPaid = Number(collectionR.rows[0]?.amount_paid ?? 0);

    const pct = (part: number, whole: number) =>
      whole > 0 ? Math.round((part / whole) * 100) : null;

    res.status(200).json(
      ok(
        {
          attendanceRate: pct(attPresent, attTotal),
          attendancePresent: attPresent,
          attendanceTotal: attTotal,
          homeworkRate: pct(hwSubmitted, hwExpected),
          homeworkSubmitted: hwSubmitted,
          homeworkExpected: hwExpected,
          collectionRate: pct(amountPaid, totalDue),
          amountPaid,
          totalDue,
        },
        'مؤشرات أداء المعلم لهذا الشهر'
      )
    );
  }

  // GET /api/teacher/dashboard/activity
  static async getRecentActivity(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const limit = Math.min(Math.max(Number(req.query['limit']) || 10, 1), 30);

    const r = await pool.query(
      `WITH events AS (
         SELECT
           'booking'::text AS kind,
           cb.id::text AS id,
           CASE cb.status
             WHEN 'pending' THEN 'طلب حجز جديد'
             WHEN 'pre_approved' THEN 'تأهيل مبدئي لحجز'
             WHEN 'confirmed' THEN 'تأكيد حجز'
             WHEN 'approved' THEN 'موافقة على حجز'
             WHEN 'rejected' THEN 'رفض حجز'
             WHEN 'cancelled' THEN 'إلغاء حجز'
             ELSE 'تحديث حجز'
           END AS title,
           TRIM(BOTH ' · ' FROM CONCAT_WS(' · ', NULLIF(u.name, ''), NULLIF(c.course_name, ''))) AS subtitle,
           COALESCE(cb.updated_at, cb.created_at) AS occurred_at,
           cb.status AS status
         FROM course_bookings cb
         JOIN users u ON u.id = cb.student_id
         JOIN courses c ON c.id = cb.course_id
         WHERE cb.teacher_id = $1
           AND cb.is_deleted = false

         UNION ALL

         SELECT
           'deposit'::text,
           rp.id::text,
           CASE WHEN rp.status = 'paid' THEN 'دفعة حجز مستلمة' ELSE 'دفعة حجز' END,
           TRIM(BOTH ' · ' FROM CONCAT_WS(' · ', NULLIF(u.name, ''), NULLIF(c.course_name, ''),
             CASE WHEN rp.amount IS NOT NULL THEN CONCAT(ROUND(rp.amount)::int::text, ' د.ع') ELSE NULL END)),
           COALESCE(rp.paid_at, rp.updated_at, rp.created_at),
           rp.status
         FROM reservation_payments rp
         LEFT JOIN users u ON u.id = rp.student_id
         LEFT JOIN courses c ON c.id = rp.course_id
         WHERE rp.teacher_id = $1

         UNION ALL

         SELECT
           'invoice'::text,
           ci.id::text,
           CASE
             WHEN ci.invoice_status = 'paid' OR COALESCE(ci.remaining_amount, 0) <= 0 THEN 'سداد فاتورة'
             WHEN COALESCE(ci.amount_paid, 0) > 0 THEN 'دفعة على فاتورة'
             ELSE 'فاتورة جديدة'
           END,
           TRIM(BOTH ' · ' FROM CONCAT_WS(' · ', NULLIF(u.name, ''), NULLIF(c.course_name, ''),
             CASE WHEN ci.amount_paid IS NOT NULL AND ci.amount_paid > 0
               THEN CONCAT(ROUND(ci.amount_paid)::int::text, ' د.ع') ELSE NULL END)),
           COALESCE(ci.updated_at, ci.created_at),
           ci.invoice_status
         FROM course_invoices ci
         LEFT JOIN users u ON u.id = ci.student_id
         LEFT JOIN courses c ON c.id = ci.course_id
         WHERE ci.teacher_id = $1
           AND ci.deleted_at IS NULL
           AND (COALESCE(ci.amount_paid, 0) > 0 OR ci.invoice_status IN ('paid', 'partial', 'pending', 'overdue'))
       )
       SELECT kind, id, title, subtitle, occurred_at, status
         FROM events
        WHERE occurred_at IS NOT NULL
        ORDER BY occurred_at DESC
        LIMIT $2`,
      [teacherId, limit]
    );

    const items = r.rows.map((row: any) => ({
      kind: String(row.kind),
      id: String(row.id),
      title: String(row.title),
      subtitle: row.subtitle ? String(row.subtitle) : null,
      occurredAt: row.occurred_at ? new Date(row.occurred_at).toISOString() : null,
      status: row.status ? String(row.status) : null,
    }));

    res.status(200).json(ok(items, 'آخر نشاطات المعلم', { count: items.length }));
  }

  // GET /api/teacher/dashboard/referrals
  // (Phase 7) The bonus-seat sub-queries against the dropped
  // teacher_subscription_bonuses + teacher_subscriptions tables are
  // gone. Referral counts are still useful and stay; bonus reporting will
  // be re-modelled around wallet credits in a later phase.
  static async getReferralStats(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const referralsByStatusR = await pool.query(
      `SELECT status, COUNT(*)::int AS count
         FROM teacher_referrals
        WHERE referrer_teacher_id = $1
        GROUP BY status`,
      [teacherId]
    );

    let pending = 0;
    let completed = 0;
    let rejected = 0;
    for (const row of referralsByStatusR.rows) {
      if (row.status === 'pending') pending = row.count;
      else if (row.status === 'completed') completed = row.count;
      else if (row.status === 'rejected') rejected = row.count;
    }
    const total = pending + completed + rejected;

    const referralCode = teacherId;
    const frontendBase = process.env['FRONTEND_BASE_URL'] || '';
    const referralLink = frontendBase
      ? `${frontendBase.replace(/\/$/, '')}/register/teacher?ref=${encodeURIComponent(referralCode)}`
      : `/register/teacher?ref=${encodeURIComponent(referralCode)}`;

    res.status(200).json(
      ok(
        {
          referralCode,
          referralLink,
          referrals: { pending, completed, rejected, total },
          bonuses: { totalBonusSeats: 0, activeBonuses: [] },
        },
        'إحصائيات نظام الإحالات للمعلم'
      )
    );
  }
}
