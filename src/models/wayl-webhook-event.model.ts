import pool from '../config/database';

export type WaylWebhookProcessingStatus =
  | 'received'
  | 'processed'
  | 'ignored'
  | 'failed';

export class WaylWebhookEventModel {
  static async create(params: {
    paymentLinkId?: string | null;
    referenceId?: string | null;
    signature?: string | null;
    signatureValid: boolean;
    headers?: any;
    rawBody?: string | null;
    body?: any;
  }): Promise<{ id: string } | null> {
    const r = await pool.query(
      `INSERT INTO wayl_webhook_events (
        payment_link_id, reference_id, signature, signature_valid,
        headers, raw_body, body, processing_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'received')
      RETURNING id`,
      [
        params.paymentLinkId || null,
        params.referenceId || null,
        params.signature || null,
        params.signatureValid,
        params.headers ?? null,
        params.rawBody ?? null,
        params.body ?? null,
      ]
    );
    return r.rows[0] || null;
  }

  static async markProcessed(params: {
    id: string;
    status: WaylWebhookProcessingStatus;
    message?: string | null;
  }): Promise<void> {
    await pool.query(
      `UPDATE wayl_webhook_events
       SET processed_at = CURRENT_TIMESTAMP,
           processing_status = $2,
           processing_message = $3
       WHERE id = $1`,
      [params.id, params.status, params.message ?? null]
    );
  }
}
