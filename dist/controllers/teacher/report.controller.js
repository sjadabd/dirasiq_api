"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherReportController = void 0;
const database_1 = __importDefault(require("../../config/database"));
const teacher_expense_model_1 = require("../../models/teacher-expense.model");
class TeacherReportController {
    static async financial(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const teacherId = String(me.id);
            const from = req.query.from ? String(req.query.from) : undefined;
            const to = req.query.to ? String(req.query.to) : undefined;
            const studyYear = req.query.studyYear ? String(req.query.studyYear) : undefined;
            const conds = ['ci.teacher_id = $1', 'ci.deleted_at IS NULL'];
            const params = [teacherId];
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
            const reservationQ = `
        SELECT
          COALESCE(SUM(CASE WHEN ci.invoice_type = 'reservation' THEN ci.amount_due ELSE 0 END),0)::decimal AS total_due,
          COALESCE(SUM(CASE WHEN ci.invoice_type = 'reservation' THEN ci.discount_total ELSE 0 END),0)::decimal AS total_discount,
          COALESCE(SUM(CASE WHEN ci.invoice_type = 'reservation' THEN ci.amount_paid ELSE 0 END),0)::decimal AS total_paid,
          COALESCE(SUM(CASE WHEN ci.invoice_type = 'reservation' THEN ci.remaining_amount ELSE 0 END),0)::decimal AS total_remaining
        FROM course_invoices ci
        ${where}
      `;
            const studentInvQ = `
        SELECT
          COALESCE(SUM(CASE WHEN ci.invoice_type <> 'reservation' THEN ci.amount_due ELSE 0 END),0)::decimal AS total_due,
          COALESCE(SUM(CASE WHEN ci.invoice_type <> 'reservation' THEN ci.discount_total ELSE 0 END),0)::decimal AS total_discount,
          COALESCE(SUM(CASE WHEN ci.invoice_type <> 'reservation' THEN ci.amount_paid ELSE 0 END),0)::decimal AS total_paid,
          COALESCE(SUM(CASE WHEN ci.invoice_type <> 'reservation' THEN ci.remaining_amount ELSE 0 END),0)::decimal AS total_remaining
        FROM course_invoices ci
        ${where}
      `;
            const [resReservation, resStudent] = await Promise.all([
                database_1.default.query(reservationQ, params),
                database_1.default.query(studentInvQ, params),
            ]);
            const reservation = {
                totalDue: Number(resReservation.rows[0].total_due || 0),
                totalDiscount: Number(resReservation.rows[0].total_discount || 0),
                totalPaid: Number(resReservation.rows[0].total_paid || 0),
                totalRemaining: Number(resReservation.rows[0].total_remaining || 0),
            };
            const studentInvoices = {
                totalDue: Number(resStudent.rows[0].total_due || 0),
                totalDiscount: Number(resStudent.rows[0].total_discount || 0),
                totalPaid: Number(resStudent.rows[0].total_paid || 0),
                totalRemaining: Number(resStudent.rows[0].total_remaining || 0),
            };
            const expensesTotal = await teacher_expense_model_1.TeacherExpenseModel.sum(teacherId, from, to, studyYear);
            const totalPaidIncome = studentInvoices.totalPaid + reservation.totalPaid;
            const totalDueIncome = studentInvoices.totalDue + reservation.totalDue;
            const netProfitPaidBasis = totalPaidIncome - expensesTotal;
            const netProfitDueBasis = totalDueIncome - (studentInvoices.totalDiscount + reservation.totalDiscount) - expensesTotal;
            res.status(200).json({
                success: true,
                data: {
                    filters: { from: from || null, to: to || null, studyYear: studyYear || null },
                    invoices: {
                        student: studentInvoices,
                        reservation,
                    },
                    expenses: { total: expensesTotal },
                    summary: {
                        totalPaidIncome,
                        totalDueIncome,
                        netProfitPaidBasis,
                        netProfitDueBasis,
                    }
                }
            });
        }
        catch (error) {
            console.error('Error financial report:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
}
exports.TeacherReportController = TeacherReportController;
//# sourceMappingURL=report.controller.js.map