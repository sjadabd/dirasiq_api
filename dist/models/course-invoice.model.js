"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CourseInvoiceModel = void 0;
const database_1 = __importDefault(require("../config/database"));
class CourseInvoiceModel {
    static async create(data) {
        const q = `
      INSERT INTO course_invoices (
        student_id, teacher_id, course_id, study_year, invoice_type, payment_mode,
        amount_due, discount_total, amount_paid, invoice_status, invoice_date, due_date, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7, 0, 0, 'pending', COALESCE($8, TO_CHAR(CURRENT_DATE,'YYYY-MM-DD')), $9, $10)
      RETURNING *
    `;
        const v = [
            data.studentId,
            data.teacherId,
            data.courseId,
            data.studyYear,
            data.invoiceType,
            data.paymentMode,
            data.amountDue,
            data.invoiceDate || null,
            data.dueDate || null,
            data.notes || null,
        ];
        const r = await database_1.default.query(q, v);
        return r.rows[0];
    }
    static async findById(id) {
        const r = await database_1.default.query('SELECT * FROM course_invoices WHERE id = $1 AND deleted_at IS NULL', [id]);
        return r.rows[0] || null;
    }
    static async updateAggregates(id, delta) {
        const setParts = [];
        const params = [];
        let idx = 1;
        if (typeof delta.amountPaid === 'number') {
            setParts.push(`amount_paid = GREATEST(amount_paid + $${idx}, 0)`);
            params.push(delta.amountPaid);
            idx++;
        }
        if (typeof delta.discountTotal === 'number') {
            setParts.push(`discount_total = GREATEST(discount_total + $${idx}, 0)`);
            params.push(delta.discountTotal);
            idx++;
        }
        setParts.push(`updated_at = NOW()`);
        const q = `UPDATE course_invoices SET ${setParts.join(', ')} WHERE id = $${idx} RETURNING *`;
        params.push(id);
        const r = await database_1.default.query(q, params);
        return r.rows[0] || null;
    }
    static async updateStatusPaidIfZeroRemaining(id) {
        const q = `
      UPDATE course_invoices
      SET invoice_status = CASE
        WHEN remaining_amount = 0 THEN 'paid'
        WHEN amount_paid > 0 AND remaining_amount > 0 THEN 'partial'
        ELSE 'pending'
      END,
      paid_date = CASE WHEN remaining_amount = 0 THEN (CURRENT_DATE)::text ELSE paid_date END,
      updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
        const r = await database_1.default.query(q, [id]);
        return r.rows[0] || null;
    }
    static async listByTeacher(teacherId, studyYear, status) {
        let where = 'WHERE teacher_id = $1 AND study_year = $2 AND deleted_at IS NULL';
        const params = [teacherId, studyYear];
        if (status) {
            where += ' AND invoice_status = $3';
            params.push(status);
        }
        const q = `SELECT * FROM course_invoices ${where} ORDER BY created_at DESC`;
        const r = await database_1.default.query(q, params);
        return r.rows;
    }
}
exports.CourseInvoiceModel = CourseInvoiceModel;
//# sourceMappingURL=course-invoice.model.js.map