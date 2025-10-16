import { Request, Response } from 'express';
import pool from '../../config/database';
import { ReservationPaymentModel } from '../../models/reservation-payment.model';
import { ApiResponse, AuthenticatedRequest } from '../../types';

export class TeacherPaymentController {
  // GET /teacher/payments/reservations
  static async getReservationPayments(req: AuthenticatedRequest & Request, res: Response<ApiResponse>) {
    try {
      const teacherId = req.user?.id as string;
      const studyYear = (req.query['studyYear'] as string) || '';
      const page = parseInt((req.query['page'] as string) || '1', 10);
      const limit = parseInt((req.query['limit'] as string) || '10', 10);

      if (!studyYear) {
        return res.status(400).json({ success: false, message: 'studyYear is required' });
      }

      // List query with pagination
      const offset = (page - 1) * limit;
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
        pool.query(listQ, [teacherId, studyYear, limit, offset]),
        pool.query(countQ, [teacherId, studyYear]),
        ReservationPaymentModel.getTeacherReport(teacherId, studyYear)
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
        // Provide a link for a detailed booking payment report
        reportLink: `/teacher/payments/reservations/${row.booking_id}`
      }));

      // Build report totals (same logic as in getReservationPaymentsReport)
      const totalAmount = report.items.reduce((sum: number, it: any) => sum + (it.amount || 0), 0);
      const totalPaidAmount = report.items
        .filter((it: any) => it.status === 'paid')
        .reduce((sum: number, it: any) => sum + (it.amount || 0), 0);
      const discountAmount = 0; // No discount column yet
      const remainingAmount = totalAmount - totalPaidAmount - discountAmount;

      return res.json({
        success: true,
        message: 'Reservation payments fetched successfully',
        data: {
          studyYear,
          items,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          },
          report: {
            teacherId: report.teacherId,
            studyYear: report.studyYear,
            counts: {
              totalPaid: report.totalPaid,
              totalPending: report.totalPending,
            },
            totals: {
              totalAmount,
              totalPaidAmount,
              discountAmount,
              remainingAmount,
            },
          },
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch reservation payments' });
    }
  }

  // GET /teacher/payments/reservations/report
  static async getReservationPaymentsReport(req: AuthenticatedRequest & Request, res: Response<ApiResponse>) {
    try {
      const teacherId = req.user?.id as string;
      const studyYear = (req.query['studyYear'] as string) || '';

      if (!studyYear) {
        return res.status(400).json({ success: false, message: 'studyYear is required' });
      }

      const report = await ReservationPaymentModel.getTeacherReport(teacherId, studyYear);

      // Financial totals
      const totalAmount = report.items.reduce((sum, it) => sum + (it.amount || 0), 0);
      const totalPaidAmount = report.items
        .filter(it => it.status === 'paid')
        .reduce((sum, it) => sum + (it.amount || 0), 0);
      const discountAmount = 0; // No discount field in schema yet
      const remainingAmount = totalAmount - totalPaidAmount - discountAmount;

      return res.json({
        success: true,
        message: 'Reservation payments report generated',
        data: {
          teacherId: report.teacherId,
          studyYear: report.studyYear,
          counts: {
            totalPaid: report.totalPaid,
            totalPending: report.totalPending
          },
          totals: {
            totalAmount,
            totalPaidAmount,
            discountAmount,
            remainingAmount
          },
          // Provide a hyperlink to the list for quick access
          listLink: '/teacher/payments/reservations'
        }
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to build report' });
    }
  }

  // GET /teacher/payments/reservations/:bookingId
  static async getReservationPaymentByBooking(req: AuthenticatedRequest & Request, res: Response<ApiResponse>) {
    try {
      const teacherId = req.user?.id as string;
      const { bookingId } = req.params as { bookingId: string };

      // Verify ownership and fetch details
      const q = `
        SELECT
          rp.*,
          s.name AS student_name,
          c.course_name,
          cb.study_year
        FROM reservation_payments rp
        JOIN users s ON s.id = rp.student_id
        JOIN courses c ON c.id = rp.course_id
        JOIN course_bookings cb ON cb.id = rp.booking_id
        WHERE rp.booking_id = $1 AND rp.teacher_id = $2 AND cb.is_deleted = false
        LIMIT 1
      `;

      const r = await pool.query(q, [bookingId, teacherId]);
      if (r.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Payment not found' });
      }

      const row = r.rows[0];
      const data = {
        bookingId: String(row.booking_id),
        studentId: String(row.student_id),
        studentName: String(row.student_name),
        courseId: String(row.course_id),
        courseName: String(row.course_name),
        amount: Number(row.amount),
        status: row.status as 'pending' | 'paid',
        paidAt: row.paid_at || undefined,
        studyYear: String(row.study_year)
      };

      return res.json({ success: true, message: 'Payment fetched', data });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch payment' });
    }
  }
}
