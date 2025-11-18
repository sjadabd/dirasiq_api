import pool from '../config/database';

export class TeacherReferralModel {
  // إنشاء إحالة جديدة في حالة pending
  static async createPending(params: {
    referrerTeacherId: string;
    referredTeacherId: string;
    referralCodeUsed: string;
  }): Promise<void> {
    const query = `
      INSERT INTO teacher_referrals (
        referrer_teacher_id,
        referred_teacher_id,
        referral_code_used,
        status
      ) VALUES ($1, $2, $3, 'pending')
      ON CONFLICT (referred_teacher_id) DO NOTHING
    `;

    const values = [
      params.referrerTeacherId,
      params.referredTeacherId,
      params.referralCodeUsed,
    ];

    await pool.query(query, values);
  }

  // إيجاد إحالة حسب المعلّم المدعو وهي pending
  static async findPendingByReferredTeacherId(
    referredTeacherId: string
  ): Promise<any | null> {
    const query = `
      SELECT * FROM teacher_referrals
      WHERE referred_teacher_id = $1 AND status = 'pending'
    `;

    const result = await pool.query(query, [referredTeacherId]);
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  // تحديث حالة الإحالة
  static async updateStatus(
    id: string,
    status: 'pending' | 'completed' | 'rejected'
  ): Promise<void> {
    const query = `
      UPDATE teacher_referrals
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `;

    await pool.query(query, [status, id]);
  }
}
