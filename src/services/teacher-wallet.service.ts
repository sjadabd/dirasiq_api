import pool from '../config/database';

export class TeacherWalletService {
  static async ensureWallet(teacherId: string, client?: any): Promise<void> {
    const db = client || pool;
    await db.query(
      `INSERT INTO teacher_wallets (teacher_id, balance)
       VALUES ($1, 0)
       ON CONFLICT (teacher_id) DO NOTHING`,
      [teacherId]
    );
  }

  static async getBalance(teacherId: string): Promise<number> {
    await this.ensureWallet(teacherId);
    const r = await pool.query(
      'SELECT balance FROM teacher_wallets WHERE teacher_id = $1',
      [teacherId]
    );
    return Number(r.rows[0]?.balance || 0);
  }

  static async credit(options: {
    teacherId: string;
    amount: number;
    referenceType?: string | null;
    referenceId?: string | null;
    client?: any;
  }): Promise<{ balanceBefore: number; balanceAfter: number }> {
    if (!Number.isFinite(options.amount) || options.amount <= 0) {
      throw new Error('Amount must be > 0');
    }

    const db = options.client || pool;
    await this.ensureWallet(options.teacherId, db);

    const lockR = await db.query(
      'SELECT balance FROM teacher_wallets WHERE teacher_id = $1 FOR UPDATE',
      [options.teacherId]
    );
    const balanceBefore = Number(lockR.rows[0]?.balance || 0);
    const balanceAfter = balanceBefore + options.amount;

    await db.query(
      'UPDATE teacher_wallets SET balance = $2, updated_at = CURRENT_TIMESTAMP WHERE teacher_id = $1',
      [options.teacherId, balanceAfter]
    );

    await db.query(
      `INSERT INTO teacher_wallet_transactions (teacher_id, txn_type, amount, balance_before, balance_after, reference_type, reference_id)
       VALUES ($1, 'topup', $2, $3, $4, $5, $6)`,
      [
        options.teacherId,
        options.amount,
        balanceBefore,
        balanceAfter,
        options.referenceType || null,
        options.referenceId || null,
      ]
    );

    return { balanceBefore, balanceAfter };
  }

  static async debit(options: {
    teacherId: string;
    amount: number;
    referenceType?: string | null;
    referenceId?: string | null;
    client?: any;
  }): Promise<{ balanceBefore: number; balanceAfter: number }> {
    if (!Number.isFinite(options.amount) || options.amount <= 0) {
      throw new Error('Amount must be > 0');
    }

    const db = options.client || pool;
    await this.ensureWallet(options.teacherId, db);

    const lockR = await db.query(
      'SELECT balance FROM teacher_wallets WHERE teacher_id = $1 FOR UPDATE',
      [options.teacherId]
    );
    const balanceBefore = Number(lockR.rows[0]?.balance || 0);
    if (balanceBefore < options.amount) {
      throw new Error('رصيد المحفظة غير كافي');
    }

    const balanceAfter = balanceBefore - options.amount;
    await db.query(
      'UPDATE teacher_wallets SET balance = $2, updated_at = CURRENT_TIMESTAMP WHERE teacher_id = $1',
      [options.teacherId, balanceAfter]
    );

    await db.query(
      `INSERT INTO teacher_wallet_transactions (teacher_id, txn_type, amount, balance_before, balance_after, reference_type, reference_id)
       VALUES ($1, 'debit', $2, $3, $4, $5, $6)`,
      [
        options.teacherId,
        options.amount,
        balanceBefore,
        balanceAfter,
        options.referenceType || null,
        options.referenceId || null,
      ]
    );

    return { balanceBefore, balanceAfter };
  }
}
