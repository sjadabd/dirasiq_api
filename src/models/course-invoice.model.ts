import pool from '@/config/database';
import { InvoiceStatus, InvoiceType } from '@/types';

export interface DbCourseInvoice {
  id: string;
  student_id: string;
  teacher_id: string;
  course_id: string;
  study_year: string;
  invoice_number: string | null;
  invoice_type: InvoiceType;
  payment_mode: 'cash' | 'installments';
  amount_due: number;
  discount_total: number;
  amount_paid: number;
  remaining_amount: number;
  invoice_status: InvoiceStatus;
  invoice_date: string;
  due_date: string | null;
  paid_date: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export class CourseInvoiceModel {
  static async create(data: {
    studentId: string;
    teacherId: string;
    courseId: string;
    studyYear: string;
    invoiceType: InvoiceType;
    paymentMode: 'cash' | 'installments';
    amountDue: number;
    dueDate?: string | null;
    notes?: string | null;
  }): Promise<DbCourseInvoice> {
    const q = `
      INSERT INTO course_invoices (
        student_id, teacher_id, course_id, study_year, invoice_type, payment_mode,
        amount_due, discount_total, amount_paid, invoice_status, invoice_date, due_date, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7, 0, 0, 'pending', CURRENT_DATE, $8, $9)
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
      data.dueDate || null,
      data.notes || null,
    ];
    const r = await pool.query(q, v);
    return r.rows[0];
  }

  static async findById(id: string): Promise<DbCourseInvoice | null> {
    const r = await pool.query('SELECT * FROM course_invoices WHERE id = $1 AND deleted_at IS NULL', [id]);
    return r.rows[0] || null;
  }

  static async updateAggregates(id: string, delta: { amountPaid?: number; discountTotal?: number }): Promise<DbCourseInvoice | null> {
    const setParts: string[] = [];
    const params: any[] = [];
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
    const r = await pool.query(q, params);
    return r.rows[0] || null;
  }

  static async updateStatusPaidIfZeroRemaining(id: string): Promise<DbCourseInvoice | null> {
    const q = `
      UPDATE course_invoices
      SET invoice_status = CASE
        WHEN remaining_amount = 0 THEN 'paid'
        WHEN amount_paid > 0 AND remaining_amount > 0 THEN 'partial'
        ELSE 'pending'
      END,
      paid_date = CASE WHEN remaining_amount = 0 THEN NOW() ELSE paid_date END,
      updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const r = await pool.query(q, [id]);
    return r.rows[0] || null;
  }

  static async listByTeacher(teacherId: string, studyYear: string, status?: InvoiceStatus): Promise<DbCourseInvoice[]> {
    let where = 'WHERE teacher_id = $1 AND study_year = $2 AND deleted_at IS NULL';
    const params: any[] = [teacherId, studyYear];
    if (status) {
      where += ' AND invoice_status = $3';
      params.push(status);
    }
    const q = `SELECT * FROM course_invoices ${where} ORDER BY created_at DESC`;
    const r = await pool.query(q, params);
    return r.rows as DbCourseInvoice[];
  }
}
