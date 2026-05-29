import pool from '../config/database';

// Phase 7 retired the 'subscription' purpose alongside the entire legacy
// subscription system (see migration 038). The string is intentionally kept
// in this enum so historical paid rows (if any) still type-check on read;
// new INSERTs only ever use 'wallet_topup' (and 'enrollment' once Phase 14
// lands). The catalogue FK `subscription_package_id` was dropped by the
// same migration — this model must NOT reference it on INSERT, or the
// query fails with 'column … does not exist' on any DB that's caught up
// past 038. That's exactly the prod 500 fixed here.
//
// Phase 4 marketplace adds 'video_course_purchase'. The column has no
// CHECK constraint so the value is just a new allowed string from the
// application's perspective.
export type WaylPaymentPurpose =
  | 'subscription'
  | 'wallet_topup'
  | 'video_course_purchase';
export type WaylPaymentStatus = 'created' | 'paid' | 'failed' | 'canceled';

export interface WaylPaymentLinkRow {
  id: string;
  teacher_id: string;
  purpose: WaylPaymentPurpose;
  amount: any;
  currency: string;
  reference_id: string;
  wayl_order_id: string | null;
  wayl_code: string | null;
  wayl_url: string | null;
  wayl_secret: string;
  status: WaylPaymentStatus;
  webhook_received_at: Date | null;
  // Phase 1 marketplace FK (migration 052). NULL for non-marketplace rows.
  video_course_purchase_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export class WaylPaymentLinkModel {
  static async create(options: {
    teacherId: string;
    purpose: WaylPaymentPurpose;
    amount: number;
    currency?: string;
    referenceId: string;
    waylSecret: string;
    waylUrl?: string | null;
    waylOrderId?: string | null;
    waylCode?: string | null;
    // Phase 4 — used when purpose='video_course_purchase'. The webhook
    // handler uses this FK to find the purchase row without parsing the
    // reference_id format.
    videoCoursePurchaseId?: string | null;
  }, client?: any): Promise<WaylPaymentLinkRow> {
    const db = client || pool;
    const q = `
      INSERT INTO wayl_payment_links (
        teacher_id, purpose, amount, currency,
        reference_id, wayl_secret, wayl_url, wayl_order_id, wayl_code,
        video_course_purchase_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `;
    const r = (await db.query(q, [
      options.teacherId,
      options.purpose,
      options.amount,
      (options.currency || 'iqd').toLowerCase(),
      options.referenceId,
      options.waylSecret,
      options.waylUrl || null,
      options.waylOrderId || null,
      options.waylCode || null,
      options.videoCoursePurchaseId || null,
    ])) as { rows: WaylPaymentLinkRow[] };
    return r.rows[0]!;
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
