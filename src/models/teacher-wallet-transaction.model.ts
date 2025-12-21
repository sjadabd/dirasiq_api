import pool from '../config/database';

export type WalletTxnType = 'topup' | 'debit' | 'adjustment';

export interface TeacherWalletTransactionRow {
  id: string;
  teacher_id: string;
  txn_type: WalletTxnType;
  amount: any;
  balance_before: any;
  balance_after: any;
  reference_type: string | null;
  reference_id: string | null;
  created_at: Date;
}

export class TeacherWalletTransactionModel {
  static async listByTeacher(
    teacherId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<TeacherWalletTransactionRow[]> {
    const q = `
      SELECT * FROM teacher_wallet_transactions
      WHERE teacher_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const r = await pool.query(q, [teacherId, limit, offset]);
    return r.rows;
  }
}
