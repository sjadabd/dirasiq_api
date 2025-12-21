import pool from '../config/database';

export class TeacherWalletModel {
  static async ensureWallet(teacherId: string): Promise<void> {
    await pool.query(
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
}
