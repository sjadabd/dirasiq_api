import pool from '../config/database';
import { Token } from '../types';

export class TokenModel {
  // Create a new token (مع إمكانية إضافة playerId)
  static async create(
    userId: string,
    token: string,
    expiresAt: Date,
    oneSignalPlayerId?: string
  ): Promise<Token> {
    const query = `
      INSERT INTO tokens (user_id, token, expires_at, onesignal_player_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const result = await pool.query(query, [userId, token, expiresAt, oneSignalPlayerId || null]);
    return this.mapDatabaseTokenToToken(result.rows[0]);
  }

  static async getPlayerIdsByUserId(userId: string): Promise<string[]> {
    const query = `
      SELECT DISTINCT onesignal_player_id
      FROM tokens
      WHERE user_id = $1
        AND onesignal_player_id IS NOT NULL
    `;
    const result = await pool.query(query, [userId]);

    return result.rows
      .map(r => r.onesignal_player_id)
      .filter((id: string | null) => id && id.trim().length > 0);
  }

  // تحديث Player ID لتوكن معين
  static async updatePlayerId(userId: string, token: string, playerId: string): Promise<boolean> {
    const query = `
      UPDATE tokens
      SET onesignal_player_id = $1
      WHERE user_id = $2 AND token = $3 AND expires_at > CURRENT_TIMESTAMP
    `;
    const result = await pool.query(query, [playerId, userId, token]);
    return (result.rowCount || 0) > 0;
  }

  // Get آخر Player ID للمستخدم (من أحدث جلسة)
  static async getPlayerId(userId: string): Promise<string | null> {
    const query = `
      SELECT onesignal_player_id
      FROM tokens
      WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const result = await pool.query(query, [userId]);
    return result.rows[0]?.onesignal_player_id || null;
  }

  // Find token by token string
  static async findByToken(token: string): Promise<Token | null> {
    const query = `
      SELECT * FROM tokens
      WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP
    `;

    const result = await pool.query(query, [token]);
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDatabaseTokenToToken(result.rows[0]);
  }

  // Find all tokens for a user
  static async findByUserId(userId: string): Promise<Token[]> {
    const query = `
      SELECT * FROM tokens
      WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [userId]);
    return result.rows.map((row: any) => this.mapDatabaseTokenToToken(row));
  }

  // Delete token by token string
  static async deleteByToken(token: string): Promise<boolean> {
    const query = 'DELETE FROM tokens WHERE token = $1';
    const result = await pool.query(query, [token]);
    return (result.rowCount || 0) > 0;
  }

  // Delete all tokens for a user
  static async deleteByUserId(userId: string): Promise<boolean> {
    const query = 'DELETE FROM tokens WHERE user_id = $1';
    const result = await pool.query(query, [userId]);
    return (result.rowCount || 0) > 0;
  }

  // Clean expired tokens
  static async cleanExpiredTokens(): Promise<number> {
    const query = 'DELETE FROM tokens WHERE expires_at < CURRENT_TIMESTAMP';
    const result = await pool.query(query);
    return result.rowCount || 0;
  }

  // Get token count for a user
  static async getTokenCount(userId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) FROM tokens
      WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP
    `;

    const result = await pool.query(query, [userId]);
    return parseInt(result.rows[0].count);
  }

  // Map database token to Token interface
  private static mapDatabaseTokenToToken(dbToken: any): Token {
    return {
      id: dbToken.id,
      userId: dbToken.user_id,
      token: dbToken.token,
      expiresAt: dbToken.expires_at,
      createdAt: dbToken.created_at,
      oneSignalPlayerId: dbToken.onesignal_player_id || null, // ✅ أضفناه هنا
    };
  }
}
