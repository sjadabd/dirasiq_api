import pool from '../config/database';
import { InstallmentStatus } from '../types';

export interface DbInvoiceInstallment {
  id: string;
  invoice_id: string;
  installment_number: number;
  planned_amount: number;
  paid_amount: number;
  remaining_amount: number; // stored generated
  installment_status: InstallmentStatus;
  due_date: string;
  paid_date: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export class InvoiceInstallmentModel {
  static async createMany(invoiceId: string, installments: Array<{ installmentNumber: number; plannedAmount: number; dueDate: string; notes?: string }>): Promise<DbInvoiceInstallment[]> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out: DbInvoiceInstallment[] = [];
      for (const inst of installments) {
        const q = `
          INSERT INTO invoice_installments (invoice_id, installment_number, planned_amount, due_date, notes)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `;
        const r = await client.query(q, [invoiceId, inst.installmentNumber, inst.plannedAmount, inst.dueDate, inst.notes || null]);
        out.push(r.rows[0]);
      }
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async listByInvoice(invoiceId: string): Promise<DbInvoiceInstallment[]> {
    const r = await pool.query('SELECT * FROM invoice_installments WHERE invoice_id = $1 AND deleted_at IS NULL ORDER BY installment_number ASC', [invoiceId]);
    return r.rows as DbInvoiceInstallment[];
  }

  static async addPayment(installmentId: string, amount: number, paidAt?: Date): Promise<DbInvoiceInstallment | null> {
    const paidStr = (paidAt ? new Date(paidAt) : new Date()).toISOString().slice(0, 10);
    const q = `
      UPDATE invoice_installments
      SET paid_amount = GREATEST(paid_amount + $1, 0),
          installment_status = CASE
            WHEN (planned_amount - (paid_amount + $1)) <= 0 THEN 'paid'
            WHEN (paid_amount + $1) > 0 THEN 'partial'
            ELSE 'pending'
          END,
          paid_date = CASE WHEN (planned_amount - (paid_amount + $1)) <= 0 THEN $2 ELSE paid_date END,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `;
    const r = await pool.query(q, [amount, paidStr, installmentId]);
    return r.rows[0] || null;
  }
}
