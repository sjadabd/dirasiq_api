// CRUD for video_course_purchases (financial ledger of marketplace sales).
//
// Phase 1 scope: data access only. The actual purchase pipeline
// (Wayl link creation + webhook crediting + refund flow) lives in
// services VideoCoursePurchaseService + the extended WaylWebhookController
// in Phase 4.

import pool from '../config/database';

export type VideoCoursePurchaseStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded';

export interface VideoCoursePurchaseRow {
  id: string;
  video_course_id: string;
  student_id: string;
  teacher_id: string;

  amount_iqd: string; // DECIMAL → string in pg by default; Number() at caller.
  platform_commission_percent: string;
  platform_commission_iqd: string;
  teacher_net_iqd: string;

  wayl_payment_link_id: string | null;
  status: VideoCoursePurchaseStatus;
  paid_at: Date | null;
  refunded_at: Date | null;
  refund_reason: string | null;

  created_at: Date;
  updated_at: Date;
}

export interface CreatePurchaseInput {
  videoCourseId: string;
  studentId: string;
  teacherId: string;
  amountIqd: number;
  platformCommissionPercent: number;
  platformCommissionIqd: number;
  teacherNetIqd: number;
}

export class VideoCoursePurchaseModel {
  /**
   * Create a pending purchase row. The unique index
   * uniq_vcp_active_per_student raises 23505 if the student already has
   * an active (pending|paid) purchase for the same video course — the
   * caller maps that to a 409 ALREADY_EXISTS.
   *
   * Wayl link is wired afterwards via `attachWaylLink`.
   */
  static async createPending(
    input: CreatePurchaseInput,
    client?: any
  ): Promise<VideoCoursePurchaseRow> {
    const db = client || pool;
    const result = (await db.query(
      `INSERT INTO video_course_purchases (
         video_course_id, student_id, teacher_id,
         amount_iqd, platform_commission_percent,
         platform_commission_iqd, teacher_net_iqd,
         status
       ) VALUES (
         $1, $2, $3,
         $4, $5,
         $6, $7,
         'pending'
       )
       RETURNING *`,
      [
        input.videoCourseId,
        input.studentId,
        input.teacherId,
        input.amountIqd,
        input.platformCommissionPercent,
        input.platformCommissionIqd,
        input.teacherNetIqd,
      ]
    )) as { rows: VideoCoursePurchaseRow[] };
    return result.rows[0]!;
  }

  /**
   * Wire a Wayl payment link to an existing pending purchase. Done after
   * the link is created so reference_id can embed the purchase id.
   */
  static async attachWaylLink(
    purchaseId: string,
    waylPaymentLinkId: string,
    client?: any
  ): Promise<void> {
    const db = client || pool;
    await db.query(
      `UPDATE video_course_purchases
          SET wayl_payment_link_id = $2,
              updated_at = now()
        WHERE id = $1`,
      [purchaseId, waylPaymentLinkId]
    );
  }

  /**
   * Mark a purchase paid. Idempotent: rows already in 'paid' are
   * untouched. Returns the row only if THIS call flipped the status
   * (so the webhook handler knows whether to credit the wallet).
   */
  static async markPaid(
    purchaseId: string,
    paidAt: Date,
    client?: any
  ): Promise<VideoCoursePurchaseRow | null> {
    const db = client || pool;
    const result = (await db.query(
      `UPDATE video_course_purchases
          SET status = 'paid',
              paid_at = $2,
              updated_at = now()
        WHERE id = $1
          AND status = 'pending'
        RETURNING *`,
      [purchaseId, paidAt]
    )) as { rows: VideoCoursePurchaseRow[] };
    return result.rows[0] ?? null;
  }

  /**
   * Mark a purchase failed. Idempotent — only flips pending rows.
   */
  static async markFailed(
    purchaseId: string,
    client?: any
  ): Promise<VideoCoursePurchaseRow | null> {
    const db = client || pool;
    const result = (await db.query(
      `UPDATE video_course_purchases
          SET status = 'failed',
              updated_at = now()
        WHERE id = $1
          AND status = 'pending'
        RETURNING *`,
      [purchaseId]
    )) as { rows: VideoCoursePurchaseRow[] };
    return result.rows[0] ?? null;
  }

  /**
   * Admin-driven refund. Only paid rows can be refunded. The actual
   * wallet debit happens in the refund service — this model only
   * updates the audit row.
   */
  static async markRefunded(
    purchaseId: string,
    reason: string,
    client?: any
  ): Promise<VideoCoursePurchaseRow | null> {
    const db = client || pool;
    const result = (await db.query(
      `UPDATE video_course_purchases
          SET status = 'refunded',
              refunded_at = now(),
              refund_reason = $2,
              updated_at = now()
        WHERE id = $1
          AND status = 'paid'
        RETURNING *`,
      [purchaseId, reason]
    )) as { rows: VideoCoursePurchaseRow[] };
    return result.rows[0] ?? null;
  }

  static async findById(id: string): Promise<VideoCoursePurchaseRow | null> {
    const { rows } = await pool.query<VideoCoursePurchaseRow>(
      'SELECT * FROM video_course_purchases WHERE id = $1',
      [id]
    );
    return rows[0] ?? null;
  }

  static async findByWaylLinkId(
    waylPaymentLinkId: string
  ): Promise<VideoCoursePurchaseRow | null> {
    const { rows } = await pool.query<VideoCoursePurchaseRow>(
      'SELECT * FROM video_course_purchases WHERE wayl_payment_link_id = $1',
      [waylPaymentLinkId]
    );
    return rows[0] ?? null;
  }

  /**
   * Has THIS student paid for THIS video course? Used by the storefront
   * UI to flip "buy" → "open" once a purchase clears.
   */
  static async hasPaidPurchase(
    videoCourseId: string,
    studentId: string
  ): Promise<boolean> {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM video_course_purchases
          WHERE video_course_id = $1
            AND student_id = $2
            AND status = 'paid'
       ) AS exists`,
      [videoCourseId, studentId]
    );
    return rows[0]?.exists ?? false;
  }
}
