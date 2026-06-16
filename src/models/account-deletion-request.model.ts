import pool from '../config/database';
import { logger } from '../utils/logger';

export type AccountDeletionRequestInput = {
  email: string;
  phone: string | null;
  reason: string | null;
  userType: string | null;
};

export type AccountDeletionRequestStatus = 'pending' | 'completed' | 'cancelled';

export type AccountDeletionRequestRow = {
  id: string;
  email: string;
  phone: string | null;
  reason: string | null;
  user_type: string | null;
  status: AccountDeletionRequestStatus;
  created_at: Date;
  updated_at: Date;
};

const ENSURE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS account_deletion_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           CITEXT NOT NULL,
    phone           VARCHAR(32),
    reason          TEXT,
    user_type       VARCHAR(20),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'completed', 'cancelled')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_email
    ON account_deletion_requests (email);

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_pending
    ON account_deletion_requests (created_at DESC)
    WHERE status = 'pending';
`;

let tableReady: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  try {
    await pool.query(ENSURE_TABLE_SQL);
  } catch (err) {
    logger.error({ err }, 'account_deletion_requests table ensure failed');
    throw err;
  }
}

function ensureTableOnce(): Promise<void> {
  if (!tableReady) {
    tableReady = ensureTable();
  }
  return tableReady;
}

export class AccountDeletionRequestModel {
  static async create(input: AccountDeletionRequestInput): Promise<string> {
    await ensureTableOnce();

    const result = await pool.query(
      `INSERT INTO account_deletion_requests (email, phone, reason, user_type)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [input.email, input.phone, input.reason, input.userType],
    );
    return result.rows[0].id as string;
  }

  static async listForAdmin(args: {
    status?: AccountDeletionRequestStatus;
    limit: number;
    offset: number;
  }): Promise<AccountDeletionRequestRow[]> {
    await ensureTableOnce();

    const conds: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    if (args.status) {
      conds.push(`status = $${p++}`);
      params.push(args.status);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(args.limit, args.offset);

    const { rows } = await pool.query<AccountDeletionRequestRow>(
      `SELECT id, email, phone, reason, user_type, status, created_at, updated_at
         FROM account_deletion_requests
         ${where}
        ORDER BY created_at DESC
        LIMIT $${p++} OFFSET $${p++}`,
      params,
    );

    return rows;
  }

  static async countForAdmin(
    status?: AccountDeletionRequestStatus,
  ): Promise<number> {
    await ensureTableOnce();

    const params: unknown[] = [];
    const where = status ? 'WHERE status = $1' : '';
    if (status) params.push(status);

    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM account_deletion_requests ${where}`,
      params,
    );

    return Number(rows[0]?.count ?? 0);
  }
}
