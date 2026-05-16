import type { Request, Response } from 'express';

import pool from '../../config/database';
import { ReservationPaymentModel } from '../../models/reservation-payment.model';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';

export class TeacherPaymentController {
  // GET /teacher/payments/reservations
  static async getReservationPayments(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const query = req.query as unknown as { studyYear: string; page?: number; limit?: number };
    const { page, limit, offset } = parsePagination(query);

    const listQ = `
      SELECT
        rp.booking_id,
        rp.student_id,
        s.name AS student_name,
        rp.course_id,
        c.course_name,
        rp.amount,
        rp.status,
        rp.paid_at,
        rp.created_at
      FROM reservation_payments rp
      JOIN users s ON s.id = rp.student_id
      JOIN courses c ON c.id = rp.course_id
      JOIN course_bookings cb ON cb.id = rp.booking_id
      WHERE rp.teacher_id = $1 AND cb.study_year = $2 AND cb.is_deleted = false
      ORDER BY rp.created_at DESC
      LIMIT $3 OFFSET $4
    `;
    const countQ = `
      SELECT COUNT(*)
      FROM reservation_payments rp
      JOIN course_bookings cb ON cb.id = rp.booking_id
      WHERE rp.teacher_id = $1 AND cb.study_year = $2 AND cb.is_deleted = false
    `;

    const [listR, countR, report] = await Promise.all([
      pool.query(listQ, [teacherId, query.studyYear, limit, offset]),
      pool.query(countQ, [teacherId, query.studyYear]),
      ReservationPaymentModel.getTeacherReport(teacherId, query.studyYear),
    ]);

    const total = parseInt(countR.rows[0].count, 10) || 0;
    const items = listR.rows.map((row: any) => ({
      bookingId: String(row.booking_id),
      studentId: String(row.student_id),
      studentName: String(row.student_name),
      courseId: String(row.course_id),
      courseName: String(row.course_name),
      amount: Number(row.amount),
      status: row.status as 'pending' | 'paid',
      paidAt: row.paid_at || undefined,
      reportLink: `/teacher/payments/reservations/${row.booking_id}`,
    }));

    const totalAmount = report.items.reduce((sum, it: any) => sum + (it.amount || 0), 0);
    const totalPaidAmount = report.items
      .filter((it: any) => it.status === 'paid')
      .reduce((sum, it: any) => sum + (it.amount || 0), 0);
    const discountAmount = 0;
    const remainingAmount = totalAmount - totalPaidAmount - discountAmount;

    res.status(200).json(
      ok(
        {
          studyYear: query.studyYear,
          items,
          pagination: buildPaginationMeta(total, page, limit),
          report: {
            teacherId: report.teacherId,
            studyYear: report.studyYear,
            counts: {
              totalPaid: report.totalPaid,
              totalPending: report.totalPending,
            },
            totals: { totalAmount, totalPaidAmount, discountAmount, remainingAmount },
          },
        },
        'تم جلب دفعات الحجز'
      )
    );
  }

  // GET /teacher/payments/reservations/report
  static async getReservationPaymentsReport(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { studyYear } = req.query as { studyYear: string };
    const report = await ReservationPaymentModel.getTeacherReport(teacherId, studyYear);
    const totalAmount = report.items.reduce((sum, it) => sum + (it.amount || 0), 0);
    const totalPaidAmount = report.items
      .filter((it) => it.status === 'paid')
      .reduce((sum, it) => sum + (it.amount || 0), 0);
    const discountAmount = 0;
    const remainingAmount = totalAmount - totalPaidAmount - discountAmount;

    res.status(200).json(
      ok(
        {
          teacherId: report.teacherId,
          studyYear: report.studyYear,
          counts: {
            totalPaid: report.totalPaid,
            totalPending: report.totalPending,
          },
          totals: { totalAmount, totalPaidAmount, discountAmount, remainingAmount },
          listLink: '/teacher/payments/reservations',
        },
        'تم إنشاء تقرير دفعات الحجز'
      )
    );
  }

  // GET /teacher/payments/reservations/:bookingId
  static async getReservationPaymentByBooking(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { bookingId } = req.params as { bookingId: string };
    const r = await pool.query(
      `SELECT rp.*, s.name AS student_name, c.course_name, cb.study_year
         FROM reservation_payments rp
         JOIN users s ON s.id = rp.student_id
         JOIN courses c ON c.id = rp.course_id
         JOIN course_bookings cb ON cb.id = rp.booking_id
        WHERE rp.booking_id = $1 AND rp.teacher_id = $2 AND cb.is_deleted = false
        LIMIT 1`,
      [bookingId, teacherId]
    );
    if (r.rows.length === 0) {
      throw new ApiError(404, 'الدفعة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    const row = r.rows[0];
    res.status(200).json(
      ok(
        {
          bookingId: String(row.booking_id),
          studentId: String(row.student_id),
          studentName: String(row.student_name),
          courseId: String(row.course_id),
          courseName: String(row.course_name),
          amount: Number(row.amount),
          status: row.status as 'pending' | 'paid',
          paidAt: row.paid_at || undefined,
          studyYear: String(row.study_year),
        },
        'تم جلب الدفعة'
      )
    );
  }

  // PATCH /teacher/payments/reservations/:bookingId/mark-paid
  static async markReservationPaid(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { bookingId } = req.params as { bookingId: string };
    const verifyR = await pool.query(
      `SELECT rp.booking_id
         FROM reservation_payments rp
         JOIN course_bookings cb ON cb.id = rp.booking_id
        WHERE rp.booking_id = $1 AND rp.teacher_id = $2 AND cb.is_deleted = false
        LIMIT 1`,
      [bookingId, teacherId]
    );
    if (verifyR.rows.length === 0) {
      throw new ApiError(
        404,
        'دفعة الحجز غير موجودة أو الوصول مرفوض',
        ErrorCodes.NOT_FOUND
      );
    }
    const updated = await ReservationPaymentModel.markPaid(bookingId);
    if (!updated) {
      throw new ApiError(404, 'دفعة الحجز غير موجودة', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(ok(updated, 'تم تأكيد دفع الحجز'));
  }
}
