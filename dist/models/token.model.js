"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenModel = void 0;
const database_1 = __importDefault(require("../config/database"));
class TokenModel {
    static async create(userId, token, expiresAt, oneSignalPlayerId) {
        const query = `
      INSERT INTO tokens (user_id, token, expires_at, onesignal_player_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
        const result = await database_1.default.query(query, [userId, token, expiresAt, oneSignalPlayerId || null]);
        return this.mapDatabaseTokenToToken(result.rows[0]);
    }
    static async getPlayerIdsByUserId(userId) {
        const query = `
      SELECT DISTINCT onesignal_player_id
      FROM tokens
      WHERE user_id = $1
        AND onesignal_player_id IS NOT NULL
    `;
        const result = await database_1.default.query(query, [userId]);
        return result.rows
            .map(r => r.onesignal_player_id)
            .filter((id) => id && id.trim().length > 0);
    }
    static async updatePlayerId(userId, token, playerId) {
        const query = `
      UPDATE tokens
      SET onesignal_player_id = $1
      WHERE user_id = $2 AND token = $3 AND expires_at > CURRENT_TIMESTAMP
    `;
        const result = await database_1.default.query(query, [playerId, userId, token]);
        return (result.rowCount || 0) > 0;
    }
    static async getPlayerId(userId) {
        const query = `
      SELECT onesignal_player_id
      FROM tokens
      WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC
      LIMIT 1
    `;
        const result = await database_1.default.query(query, [userId]);
        return result.rows[0]?.onesignal_player_id || null;
    }
    static async findByToken(token) {
        const query = `
      SELECT * FROM tokens
      WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP
    `;
        const result = await database_1.default.query(query, [token]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapDatabaseTokenToToken(result.rows[0]);
    }
    static async findByUserId(userId) {
        const query = `
      SELECT * FROM tokens
      WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC
    `;
        const result = await database_1.default.query(query, [userId]);
        return result.rows.map((row) => this.mapDatabaseTokenToToken(row));
    }
    static async deleteByToken(token) {
        const query = 'DELETE FROM tokens WHERE token = $1';
        const result = await database_1.default.query(query, [token]);
        return (result.rowCount || 0) > 0;
    }
    static async deleteByUserId(userId) {
        const query = 'DELETE FROM tokens WHERE user_id = $1';
        const result = await database_1.default.query(query, [userId]);
        return (result.rowCount || 0) > 0;
    }
    static async cleanExpiredTokens() {
        const query = 'DELETE FROM tokens WHERE expires_at < CURRENT_TIMESTAMP';
        const result = await database_1.default.query(query);
        return result.rowCount || 0;
    }
    static async getTokenCount(userId) {
        const query = `
      SELECT COUNT(*) FROM tokens
      WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP
    `;
        const result = await database_1.default.query(query, [userId]);
        return parseInt(result.rows[0].count);
    }
    static mapDatabaseTokenToToken(dbToken) {
        return {
            id: dbToken.id,
            userId: dbToken.user_id,
            token: dbToken.token,
            expiresAt: dbToken.expires_at,
            createdAt: dbToken.created_at,
            oneSignalPlayerId: dbToken.onesignal_player_id || null,
        };
    }
}
exports.TokenModel = TokenModel;
//# sourceMappingURL=token.model.js.map