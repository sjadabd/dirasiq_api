import pool from '../config/database';

export type AdWalletTxnType = 'reserve' | 'refund_full' | 'refund_unused' | 'click_charge';

export class AdvertisementWalletTransactionModel {
  static async insert(
    args: {
      advertisementId: string;
      teacherId: string;
      txnType: AdWalletTxnType;
      amount: number;
      budgetBefore: number;
      budgetAfter: number;
      referenceId?: string | null;
    },
    client: { query: typeof pool.query },
  ): Promise<void> {
    await client.query(
      `INSERT INTO advertisement_wallet_transactions (
         advertisement_id, teacher_id, txn_type, amount, budget_before, budget_after, reference_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        args.advertisementId,
        args.teacherId,
        args.txnType,
        args.amount,
        args.budgetBefore,
        args.budgetAfter,
        args.referenceId ?? null,
      ],
    );
  }

  static async sumRevenueSince(since: Date): Promise<number> {
    const { rows } = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(ABS(amount)), 0)::decimal AS total
         FROM advertisement_wallet_transactions
        WHERE txn_type = 'click_charge' AND created_at >= $1`,
      [since],
    );
    return Number(rows[0]?.total ?? 0);
  }

  static async sumClickChargesByTeacher(teacherId: string): Promise<number> {
    const { rows } = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(ABS(amount)), 0)::decimal AS total
         FROM advertisement_wallet_transactions
        WHERE teacher_id = $1 AND txn_type = 'click_charge'`,
      [teacherId],
    );
    return Number(rows[0]?.total ?? 0);
  }

  static async sumTotalRevenue(): Promise<number> {
    const { rows } = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(ABS(amount)), 0)::decimal AS total
         FROM advertisement_wallet_transactions
        WHERE txn_type = 'click_charge'`,
    );
    return Number(rows[0]?.total ?? 0);
  }
}
