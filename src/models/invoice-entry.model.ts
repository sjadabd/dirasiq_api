import pool from '@/config/database';
import { PaymentMethod } from '@/types';

export type EntryType = 'payment' | 'discount' | 'refund' | 'adjustment';

export interface DbInvoiceEntry {
  id: string;
  invoice_id: string;
  entry_type: EntryType;
  amount: number;
  installment_id: string | null;
  payment_method: PaymentMethod | null;
  installment_status: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export class InvoiceEntryModel {
  static async create(data: {
    invoiceId: string;
    entryType: EntryType;
    amount: number;
    installmentId?: string | null;
    paymentMethod?: PaymentMethod | null;
    paidAt?: Date | null;
    notes?: string | null;
  }): Promise<DbInvoiceEntry> {
    const q = `
      INSERT INTO invoice_entries (invoice_id, entry_type, amount, installment_id, payment_method, paid_at, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `;
    const v = [
      data.invoiceId,
      data.entryType,
      data.amount,
      data.installmentId || null,
      data.paymentMethod || null,
      data.paidAt || null,
      data.notes || null,
    ];
    const r = await pool.query(q, v);
    return r.rows[0];
  }

  static async listByInvoice(invoiceId: string): Promise<DbInvoiceEntry[]> {
    const r = await pool.query('SELECT * FROM invoice_entries WHERE invoice_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC', [invoiceId]);
    return r.rows as DbInvoiceEntry[];
  }
}
