"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherPaymentController = void 0;
const database_1 = __importDefault(require("../../config/database"));
const reservation_payment_model_1 = require("../../models/reservation-payment.model");
class TeacherPaymentController {
    static async getReservationPayments(req, res) {
        try {
            const teacherId = req.user?.id;
            const studyYear = req.query['studyYear'] || '';
            const page = parseInt(req.query['page'] || '1', 10);
            const limit = parseInt(req.query['limit'] || '10', 10);
            if (!studyYear) {
                return res.status(400).json({ success: false, message: 'studyYear is required' });
            }
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
                database_1.default.query(listQ, [teacherId, studyYear, limit, offset]),
                database_1.default.query(countQ, [teacherId, studyYear]),
                reservation_payment_model_1.ReservationPaymentModel.getTeacherReport(teacherId, studyYear)
            ]);
            const total = parseInt(countR.rows[0].count, 10) || 0;
            const items = listR.rows.map((row) => ({
                bookingId: String(row.booking_id),
                studentId: String(row.student_id),
                studentName: String(row.student_name),
                courseId: String(row.course_id),
                courseName: String(row.course_name),
                amount: Number(row.amount),
                status: row.status,
                paidAt: row.paid_at || undefined,
                reportLink: `/teacher/payments/reservations/${row.booking_id}`
            }));
            const totalAmount = report.items.reduce((sum, it) => sum + (it.amount || 0), 0);
            const totalPaidAmount = report.items
                .filter((it) => it.status === 'paid')
                .reduce((sum, it) => sum + (it.amount || 0), 0);
            const discountAmount = 0;
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
        }
        catch (error) {
            return res.status(500).json({ success: false, message: error.message || 'Failed to fetch reservation payments' });
        }
    }
    static async getReservationPaymentsReport(req, res) {
        try {
            const teacherId = req.user?.id;
            const studyYear = req.query['studyYear'] || '';
            if (!studyYear) {
                return res.status(400).json({ success: false, message: 'studyYear is required' });
            }
            const report = await reservation_payment_model_1.ReservationPaymentModel.getTeacherReport(teacherId, studyYear);
            const totalAmount = report.items.reduce((sum, it) => sum + (it.amount || 0), 0);
            const totalPaidAmount = report.items
                .filter(it => it.status === 'paid')
                .reduce((sum, it) => sum + (it.amount || 0), 0);
            const discountAmount = 0;
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
                    listLink: '/teacher/payments/reservations'
                }
            });
        }
        catch (error) {
            return res.status(500).json({ success: false, message: error.message || 'Failed to build report' });
        }
    }
    static async getReservationPaymentByBooking(req, res) {
        try {
            const teacherId = req.user?.id;
            const { bookingId } = req.params;
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
            const r = await database_1.default.query(q, [bookingId, teacherId]);
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
                status: row.status,
                paidAt: row.paid_at || undefined,
                studyYear: String(row.study_year)
            };
            return res.json({ success: true, message: 'Payment fetched', data });
        }
        catch (error) {
            return res.status(500).json({ success: false, message: error.message || 'Failed to fetch payment' });
        }
    }
}
exports.TeacherPaymentController = TeacherPaymentController;
//# sourceMappingURL=payment.controller.js.map