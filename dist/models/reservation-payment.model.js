"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReservationPaymentModel = void 0;
const database_1 = __importDefault(require("../config/database"));
class ReservationPaymentModel {
    static async findByBookingId(bookingId) {
        const q = 'SELECT * FROM reservation_payments WHERE booking_id = $1';
        const r = await database_1.default.query(q, [bookingId]);
        return r.rows[0] ? this.mapRow(r.rows[0]) : null;
    }
    static async markPaid(bookingId) {
        const q = `
      UPDATE reservation_payments
      SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE booking_id = $1
      RETURNING *
    `;
        const r = await database_1.default.query(q, [bookingId]);
        return r.rows[0] ? this.mapRow(r.rows[0]) : null;
    }
    static async getTeacherReport(teacherId, studyYear) {
        const totalQ = `
      SELECT
        SUM(CASE WHEN rp.status = 'paid' THEN 1 ELSE 0 END) AS total_paid,
        SUM(CASE WHEN rp.status = 'pending' THEN 1 ELSE 0 END) AS total_pending
      FROM reservation_payments rp
      JOIN course_bookings cb ON cb.id = rp.booking_id
      WHERE rp.teacher_id = $1 AND cb.study_year = $2 AND cb.is_deleted = false
    `;
        const totalR = await database_1.default.query(totalQ, [teacherId, studyYear]);
        const listQ = `
      SELECT
        rp.booking_id,
        rp.student_id,
        s.name AS student_name,
        rp.course_id,
        c.course_name,
        rp.amount,
        rp.status,
        rp.paid_at
      FROM reservation_payments rp
      JOIN users s ON s.id = rp.student_id
      JOIN courses c ON c.id = rp.course_id
      JOIN course_bookings cb ON cb.id = rp.booking_id
      WHERE rp.teacher_id = $1 AND cb.study_year = $2 AND cb.is_deleted = false
      ORDER BY rp.created_at DESC
    `;
        const listR = await database_1.default.query(listQ, [teacherId, studyYear]);
        return {
            teacherId,
            studyYear,
            totalPaid: Number(totalR.rows[0]?.total_paid || 0),
            totalPending: Number(totalR.rows[0]?.total_pending || 0),
            items: listR.rows.map((row) => ({
                bookingId: row.booking_id,
                studentId: row.student_id,
                studentName: row.student_name,
                courseId: row.course_id,
                courseName: row.course_name,
                amount: Number(row.amount),
                status: row.status,
                paidAt: row.paid_at || undefined
            }))
        };
    }
    static mapRow(row) {
        return {
            id: row.id,
            bookingId: row.booking_id,
            studentId: row.student_id,
            teacherId: row.teacher_id,
            courseId: row.course_id,
            amount: Number(row.amount),
            status: row.status,
            paidAt: row.paid_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}
exports.ReservationPaymentModel = ReservationPaymentModel;
//# sourceMappingURL=reservation-payment.model.js.map