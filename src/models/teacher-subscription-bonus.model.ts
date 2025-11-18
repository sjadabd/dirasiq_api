import pool from '../config/database';

export class TeacherSubscriptionBonusModel {
  // إنشاء بونص جديد لاشتراك معلّم
  static async create(params: {
    teacherSubscriptionId: string;
    bonusType: string;
    bonusValue: number;
    expiresAt?: Date | null;
  }): Promise<void> {
    const query = `
      INSERT INTO teacher_subscription_bonuses (
        teacher_subscription_id,
        bonus_type,
        bonus_value,
        expires_at
      ) VALUES ($1, $2, $3, $4)
    `;

    const values = [
      params.teacherSubscriptionId,
      params.bonusType,
      params.bonusValue,
      params.expiresAt ?? null,
    ];

    await pool.query(query, values);
  }

  // مجموع البونصات الفعالة لاشتراك معين
  static async getActiveBonusSum(
    teacherSubscriptionId: string
  ): Promise<number> {
    const query = `
      SELECT COALESCE(SUM(bonus_value), 0) AS total
      FROM teacher_subscription_bonuses
      WHERE teacher_subscription_id = $1
        AND (expires_at IS NULL OR expires_at > NOW())
    `;

    const result = await pool.query(query, [teacherSubscriptionId]);
    return Number(result.rows[0]?.total ?? 0);
  }
}
