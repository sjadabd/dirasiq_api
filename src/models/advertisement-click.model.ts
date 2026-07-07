import pool from '../config/database';

export class AdvertisementClickModel {
  static async tryInsert(args: {
    advertisementId: string;
    studentId: string;
    amountCharged: number;
    client: { query: typeof pool.query };
  }): Promise<string | null> {
    const { rows } = await args.client.query<{ id: string }>(
      `INSERT INTO advertisement_clicks (advertisement_id, student_id, amount_charged)
       VALUES ($1, $2, $3)
       ON CONFLICT (advertisement_id, student_id) DO NOTHING
       RETURNING id`,
      [args.advertisementId, args.studentId, args.amountCharged],
    );
    return rows[0]?.id ?? null;
  }

  static async countForAd(advertisementId: string): Promise<number> {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM advertisement_clicks WHERE advertisement_id = $1`,
      [advertisementId],
    );
    return Number(rows[0]?.count ?? 0);
  }
}
