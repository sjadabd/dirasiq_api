import pool from '../config/database';

export type WaylPaymentLinkLogEventType =
  | 'create_link_request'
  | 'create_link_response'
  | 'create_link_error';

export class WaylPaymentLinkLogModel {
  static async create(params: {
    paymentLinkId?: string | null;
    referenceId?: string | null;
    eventType: WaylPaymentLinkLogEventType;
    httpStatus?: number | null;
    payload?: any;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO wayl_payment_link_logs (
        payment_link_id, reference_id, event_type, http_status, payload
      ) VALUES ($1,$2,$3,$4,$5)`,
      [
        params.paymentLinkId || null,
        params.referenceId || null,
        params.eventType,
        params.httpStatus ?? null,
        params.payload ?? null,
      ]
    );
  }
}
