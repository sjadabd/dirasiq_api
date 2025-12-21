import pool from '../config/database';

export type WaylPaymentPurpose = 'subscription' | 'wallet_topup';
export type WaylPaymentStatus = 'created' | 'paid' | 'failed' | 'canceled';

export interface WaylPaymentLinkRow {
  id: string;
  teacher_id: string;
  purpose: WaylPaymentPurpose;
  subscription_package_id: string | null;
  amount: any;
  currency: string;
  reference_id: string;
  wayl_order_id: string | null;
  wayl_code: string | null;
  wayl_url: string | null;
  wayl_secret: string;
  status: WaylPaymentStatus;
  webhook_received_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class WaylPaymentLinkModel {
  static async create(options: {
    teacherId: string;
    purpose: WaylPaymentPurpose;
    subscriptionPackageId?: string | null;
    amount: number;
    currency?: string;
    referenceId: string;
    waylSecret: string;
    waylUrl?: string | null;
    waylOrderId?: string | null;
    waylCode?: string | null;
  }): Promise<WaylPaymentLinkRow> {
    const q = `
      INSERT INTO wayl_payment_links (
        teacher_id, purpose, subscription_package_id, amount, currency,
        reference_id, wayl_secret, wayl_url, wayl_order_id, wayl_code
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `;
    const r = await pool.query(q, [
      options.teacherId,
      options.purpose,
      options.subscriptionPackageId || null,
      options.amount,
      (options.currency || 'iqd').toLowerCase(),
      options.referenceId,
      options.waylSecret,
      options.waylUrl || null,
      options.waylOrderId || null,
      options.waylCode || null,
    ]);
    return r.rows[0];
  }

  static async findByReferenceId(
    referenceId: string
  ): Promise<WaylPaymentLinkRow | null> {
    const r = await pool.query(
      'SELECT * FROM wayl_payment_links WHERE reference_id = $1',
      [referenceId]
    );
    return r.rows[0] || null;
  }

  static async markPaidByReferenceId(
    referenceId: string,
    webhookReceivedAt: Date
  ): Promise<WaylPaymentLinkRow | null> {
    const q = `
      UPDATE wayl_payment_links
      SET status = 'paid', webhook_received_at = $2, updated_at = CURRENT_TIMESTAMP
      WHERE reference_id = $1
      RETURNING *
    `;
    const r = await pool.query(q, [referenceId, webhookReceivedAt]);
    return r.rows[0] || null;
  }

  static async updateWaylMetaByReferenceId(
    referenceId: string,
    meta: {
      waylOrderId?: string | null;
      waylCode?: string | null;
      waylUrl?: string | null;
    }
  ): Promise<void> {
    const q = `
      UPDATE wayl_payment_links
      SET wayl_order_id = COALESCE($2, wayl_order_id),
          wayl_code = COALESCE($3, wayl_code),
          wayl_url = COALESCE($4, wayl_url),
          updated_at = CURRENT_TIMESTAMP
      WHERE reference_id = $1
    `;
    await pool.query(q, [
      referenceId,
      meta.waylOrderId || null,
      meta.waylCode || null,
      meta.waylUrl || null,
    ]);
  }
}
