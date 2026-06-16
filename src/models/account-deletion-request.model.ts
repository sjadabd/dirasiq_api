import pool from '../config/database';

export type AccountDeletionRequestInput = {
  email: string;
  phone: string | null;
  reason: string | null;
  userType: string | null;
};

export class AccountDeletionRequestModel {
  static async create(input: AccountDeletionRequestInput): Promise<string> {
    const result = await pool.query(
      `INSERT INTO account_deletion_requests (email, phone, reason, user_type)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [input.email, input.phone, input.reason, input.userType],
    );
    return result.rows[0].id as string;
  }
}
