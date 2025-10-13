import { Request, Response } from 'express';
import pool from '@/config/database';
import { TeacherExpenseModel } from '@/models/teacher-expense.model';

export class TeacherReportController {
  static async financial(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const teacherId = String(me.id);
      const from = (req.query as any).from ? String((req.query as any).from) : undefined; // YYYY-MM-DD
      const to = (req.query as any).to ? String((req.query as any).to) : undefined; // YYYY-MM-DD
      const studyYear = (req.query as any).studyYear ? String((req.query as any).studyYear) : undefined;

      // Build common conditions for invoices
      const conds: string[] = ['ci.teacher_id = $1', 'ci.deleted_at IS NULL'];
      const params: any[] = [teacherId];
      let p = 2;
      if (studyYear) { conds.push(`ci.study_year = $${p++}`); params.push(studyYear); }
      if (from) { conds.push(`ci.invoice_date::date >= $${p++}::date`); params.push(from); }
      if (to) { conds.push(`ci.invoice_date::date <= $${p++}::date`); params.push(to); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

      // Aggregate reservation invoices separately
      const reservationQ = `
        SELECT 
          COALESCE(SUM(CASE WHEN ci.invoice_type = 'reservation' THEN ci.amount_due ELSE 0 END),0)::decimal AS total_due,
          COALESCE(SUM(CASE WHEN ci.invoice_type = 'reservation' THEN ci.discount_total ELSE 0 END),0)::decimal AS total_discount,
          COALESCE(SUM(CASE WHEN ci.invoice_type = 'reservation' THEN ci.amount_paid ELSE 0 END),0)::decimal AS total_paid,
          COALESCE(SUM(CASE WHEN ci.invoice_type = 'reservation' THEN ci.remaining_amount ELSE 0 END),0)::decimal AS total_remaining
        FROM course_invoices ci
        ${where}
      `;

      // Aggregate student invoices (non-reservation)
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
        pool.query(reservationQ, params),
        pool.query(studentInvQ, params),
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

      // Expenses total
      const expensesTotal = await TeacherExpenseModel.sum(teacherId, from, to, studyYear);

      // Summary and net profit: total income considered as (paid or due?)
      // We'll compute two versions for clarity; but for now, net = (studentInvoices.totalPaid + reservation.totalPaid) - expensesTotal
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
    } catch (error) {
      console.error('Error financial report:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }
}
