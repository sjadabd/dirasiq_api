import pool from '../config/database';
import { logger } from '../utils/logger';

export type AccountDeletionRequestInput = {
  email: string;
  phone: string | null;
  reason: string | null;
  userType: string | null;
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
}
