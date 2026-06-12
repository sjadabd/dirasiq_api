import type { PoolClient } from 'pg';

import pool from '../config/database';

export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'paid';
export type PayoutMethod = 'bank_transfer' | 'wayl_manual' | 'cash' | 'other';

export interface WithdrawalRequestRow {
  id: string;
  teacher_id: string;
  amount_iqd: string;
  status: WithdrawalStatus;
  held_from_video_iqd: string;
  held_from_topup_iqd: string;
  payout_method: PayoutMethod | null;
  payout_reference: string | null;
  payout_receipt_url: string | null;
  requested_notes: string | null;
  requested_destination: string | null;
  rejection_reason: string | null;
  admin_notes: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  rejected_by: string | null;
  rejected_at: Date | null;
  paid_by: string | null;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class TeacherWithdrawalRequestModel {
  static async create(
    args: {
      teacherId: string;
      amountIqd: number;
      heldFromVideoIqd: number;
      heldFromTopupIqd: number;
      requestedNotes?: string | null;
      requestedDestination?: string | null;
    },
    client?: PoolClient
  ): Promise<WithdrawalRequestRow> {
    const db = client ?? pool;
    const { rows } = await db.query<WithdrawalRequestRow>(
      `INSERT INTO teacher_withdrawal_requests
         (teacher_id, amount_iqd, held_from_video_iqd, held_from_topup_iqd,
          requested_notes, requested_destination, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [
        args.teacherId,
        args.amountIqd,
        args.heldFromVideoIqd,
        args.heldFromTopupIqd,
        args.requestedNotes ?? null,
        args.requestedDestination ?? null,
      ]
    );
    return rows[0]!;
  }

  static async findById(
    id: string,
    client?: PoolClient
  ): Promise<WithdrawalRequestRow | null> {
    const db = client ?? pool;
    const { rows } = await db.query<WithdrawalRequestRow>(
      `SELECT * FROM teacher_withdrawal_requests WHERE id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  static async listByTeacher(
    teacherId: string,
    limit: number,
    offset: number
  ): Promise<WithdrawalRequestRow[]> {
    const { rows } = await pool.query<WithdrawalRequestRow>(
      `SELECT * FROM teacher_withdrawal_requests
        WHERE teacher_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [teacherId, limit, offset]
    );
    return rows;
  }

  /**
   * Admin inbox: requests joined to the teacher name/email. Optional status
   * filter. Most-recent first.
   */
  static async listForAdmin(args: {
    status?: WithdrawalStatus;
    limit: number;
    offset: number;
  }): Promise<Array<WithdrawalRequestRow & { teacher_name: string; teacher_email: string }>> {
    const conds: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    if (args.status) {
      conds.push(`w.status = $${p++}`);
      params.push(args.status);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(args.limit, args.offset);
    const { rows } = await pool.query(
      `SELECT w.*, u.name AS teacher_name, u.email AS teacher_email
         FROM teacher_withdrawal_requests w
         JOIN users u ON u.id = w.teacher_id
         ${where}
        ORDER BY w.created_at DESC
        LIMIT $${p++} OFFSET $${p++}`,
      params
    );
    return rows as Array<WithdrawalRequestRow & { teacher_name: string; teacher_email: string }>;
  }

  static async countForAdmin(status?: WithdrawalStatus): Promise<number> {
    const params: unknown[] = [];
    const where = status ? 'WHERE status = $1' : '';
    if (status) params.push(status);
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM teacher_withdrawal_requests ${where}`,
      params
    );
    return Number(rows[0]?.count ?? 0);
  }

  /** Sum of held_from_video across the given statuses for a teacher. */
  static async sumVideoHeld(
    teacherId: string,
    statuses: WithdrawalStatus[]
  ): Promise<number> {
    const { rows } = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(held_from_video_iqd), 0)::decimal AS total
         FROM teacher_withdrawal_requests
        WHERE teacher_id = $1 AND status = ANY($2)`,
      [teacherId, statuses]
    );
    return Number(rows[0]?.total ?? 0);
  }
}
