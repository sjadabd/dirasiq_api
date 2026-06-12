import type { Request, Response } from 'express';

import pool from '../../config/database';
import { TeacherExpenseModel } from '../../models/teacher-expense.model';
import { ok } from '../../utils/response.util';

export class TeacherReportController {
  static async financial(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const query = req.query as { from?: string; to?: string; studyYear?: string };
    const from = query.from;
    const to = query.to;
    const studyYear = query.studyYear;

    // Build common conditions for invoices
    const conds: string[] = ['ci.teacher_id = $1', 'ci.deleted_at IS NULL'];
    const params: unknown[] = [teacherId];
    let p = 2;
    if (studyYear) {
      conds.push(`ci.study_year = $${p++}`);
      params.push(studyYear);
    }
    if (from) {
      conds.push(`ci.invoice_date::date >= $${p++}::date`);
      params.push(from);
    }
    if (to) {
      conds.push(`ci.invoice_date::date <= $${p++}::date`);
      params.push(to);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    // Student invoices live in course_invoices. (No reservation rows exist there
    // anymore — deposits moved to the dedicated reservation_payments table — so
    // the type filter just future-proofs the split.)
    const studentInvQ = `
      SELECT
        COALESCE(SUM(CASE WHEN ci.invoice_type <> 'reservation' THEN ci.amount_due ELSE 0 END),0)::decimal AS total_due,
        COALESCE(SUM(CASE WHEN ci.invoice_type <> 'reservation' THEN ci.discount_total ELSE 0 END),0)::decimal AS total_discount,
        COALESCE(SUM(CASE WHEN ci.invoice_type <> 'reservation' THEN ci.amount_paid ELSE 0 END),0)::decimal AS total_paid,
        COALESCE(SUM(CASE WHEN ci.invoice_type <> 'reservation' THEN ci.remaining_amount ELSE 0 END),0)::decimal AS total_remaining
      FROM course_invoices ci
      ${where}
    `;

    // Reservation deposits live in reservation_payments (status: pending | paid).
    // study_year comes from the booking; the optional from/to window applies to
    // the reservation's creation date.
    const rConds: string[] = ['rp.teacher_id = $1', 'cb.is_deleted = false'];
    const rParams: unknown[] = [teacherId];
    let rp = 2;
    if (studyYear) {
      rConds.push(`cb.study_year = $${rp++}`);
      rParams.push(studyYear);
    }
    if (from) {
      rConds.push(`rp.created_at::date >= $${rp++}::date`);
      rParams.push(from);
    }
    if (to) {
      rConds.push(`rp.created_at::date <= $${rp++}::date`);
      rParams.push(to);
    }
    const reservationQ = `
      SELECT
        COALESCE(SUM(rp.amount),0)::decimal AS total_due,
        COALESCE(SUM(CASE WHEN rp.status = 'paid' THEN rp.amount ELSE 0 END),0)::decimal AS total_paid
      FROM reservation_payments rp
      JOIN course_bookings cb ON cb.id = rp.booking_id
      WHERE ${rConds.join(' AND ')}
    `;

    const [resReservation, resStudent] = await Promise.all([
      pool.query(reservationQ, rParams),
      pool.query(studentInvQ, params),
    ]);

    const resDue = Number(resReservation.rows[0].total_due || 0);
    const resPaid = Number(resReservation.rows[0].total_paid || 0);
    const reservation = {
      totalDue: resDue,
      totalDiscount: 0,
      totalPaid: resPaid,
      totalRemaining: resDue - resPaid,
    };

    const studentInvoices = {
      totalDue: Number(resStudent.rows[0].total_due || 0),
      totalDiscount: Number(resStudent.rows[0].total_discount || 0),
      totalPaid: Number(resStudent.rows[0].total_paid || 0),
      totalRemaining: Number(resStudent.rows[0].total_remaining || 0),
    };

    const expensesTotal = await TeacherExpenseModel.sum(teacherId, from, to, studyYear);

    // Paid video-course sales. The platform takes a commission; the teacher's
    // realized income is teacher_net_iqd. Video courses are not study-year
    // scoped, so only the optional date window (on paid_at) applies.
    const vConds: string[] = ['vp.teacher_id = $1', "vp.status = 'paid'"];
    const vParams: unknown[] = [teacherId];
    let vp = 2;
    if (from) {
      vConds.push(`vp.paid_at::date >= $${vp++}::date`);
      vParams.push(from);
    }
    if (to) {
      vConds.push(`vp.paid_at::date <= $${vp++}::date`);
      vParams.push(to);
    }
    const videoQ = `
      SELECT
        COUNT(*)::int                              AS sales_count,
        COALESCE(SUM(vp.amount_iqd),0)::decimal              AS total_gross,
        COALESCE(SUM(vp.platform_commission_iqd),0)::decimal AS platform_commission,
        COALESCE(SUM(vp.teacher_net_iqd),0)::decimal         AS teacher_net
      FROM video_course_purchases vp
      WHERE ${vConds.join(' AND ')}
    `;
    const resVideo = await pool.query(videoQ, vParams);
    const videoGross = Number(resVideo.rows[0].total_gross || 0);
    const videoCommission = Number(resVideo.rows[0].platform_commission || 0);
    const videoNet = Number(resVideo.rows[0].teacher_net || 0);
    const videoCourses = {
      salesCount: Number(resVideo.rows[0].sales_count || 0),
      totalGross: videoGross,
      platformCommission: videoCommission,
      teacherNet: videoNet,
      commissionPercent:
        videoGross > 0 ? Number(((videoCommission / videoGross) * 100).toFixed(2)) : 0,
    };

    // The teacher's NET video income is realized money — it counts toward both
    // the expected (due) and the actual (paid) income bases.
    const totalPaidIncome =
      studentInvoices.totalPaid + reservation.totalPaid + videoNet;
    const totalDueIncome =
      studentInvoices.totalDue + reservation.totalDue + videoNet;
    const netProfitPaidBasis = totalPaidIncome - expensesTotal;
    const netProfitDueBasis =
      totalDueIncome -
      (studentInvoices.totalDiscount + reservation.totalDiscount) -
      expensesTotal;

    res.status(200).json(
      ok(
        {
          filters: { from: from ?? null, to: to ?? null, studyYear: studyYear ?? null },
          invoices: { student: studentInvoices, reservation },
          videoCourses,
          expenses: { total: expensesTotal },
          summary: {
            totalPaidIncome,
            totalDueIncome,
            netProfitPaidBasis,
            netProfitDueBasis,
            videoTeacherNet: videoNet,
          },
        },
        'تم جلب التقرير المالي'
      )
    );
  }
}
