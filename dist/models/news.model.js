"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsModel = void 0;
const database_1 = __importDefault(require("../config/database"));
const types_1 = require("../types");
class NewsModel {
    static mapRowToNews(row) {
        return {
            id: row.id,
            title: row.title,
            imageUrl: row.image_url ?? undefined,
            details: row.details,
            newsType: row.news_type ?? types_1.NewsType.WEB_AND_MOBILE,
            isActive: row.is_active,
            publishedAt: row.published_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            deletedAt: row.deleted_at ?? undefined,
        };
    }
    static async create(data) {
        const query = `
      INSERT INTO news (title, image_url, details, news_type)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
        const result = await database_1.default.query(query, [
            data.title,
            data.imageUrl || null,
            data.details,
            (data.newsType || types_1.NewsType.WEB_AND_MOBILE)
        ]);
        return this.mapRowToNews(result.rows[0]);
    }
    static async findById(id) {
        const query = 'SELECT * FROM news WHERE id = $1 AND deleted_at IS NULL';
        const result = await database_1.default.query(query, [id]);
        const row = result.rows[0];
        return row ? this.mapRowToNews(row) : null;
    }
    static async findAll(page = 1, limit = 10, search, isActive, newsTypes) {
        let query = 'SELECT * FROM news';
        let countQuery = 'SELECT COUNT(*) FROM news';
        const params = [];
        let paramIndex = 1;
        let whereConditions = ['deleted_at IS NULL'];
        if (search && search.trim() !== '' && search !== 'null' && search !== 'undefined') {
            whereConditions.push(`title ILIKE $${paramIndex}`);
            params.push(`%${search.trim()}%`);
            paramIndex++;
        }
        if (isActive !== undefined) {
            whereConditions.push(`is_active = $${paramIndex}`);
            params.push(isActive);
            paramIndex++;
        }
        if (newsTypes && newsTypes.length > 0) {
            whereConditions.push(`news_type = ANY($${paramIndex}::text[])`);
            params.push(newsTypes);
            paramIndex++;
        }
        if (whereConditions.length > 0) {
            const whereClause = ' WHERE ' + whereConditions.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }
        query += ' ORDER BY published_at DESC, created_at DESC';
        const offset = (page - 1) * limit;
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);
        const [result, countResult] = await Promise.all([
            database_1.default.query(query, params),
            database_1.default.query(countQuery, params.slice(0, paramIndex - 1))
        ]);
        return {
            news: result.rows.map(this.mapRowToNews),
            total: parseInt(countResult.rows[0].count)
        };
    }
    static async update(id, data) {
        const fields = [];
        const values = [];
        let paramIndex = 1;
        if (data.title !== undefined) {
            fields.push(`title = $${paramIndex}`);
            values.push(data.title);
            paramIndex++;
        }
        if (data.imageUrl !== undefined) {
            fields.push(`image_url = $${paramIndex}`);
            values.push(data.imageUrl);
            paramIndex++;
        }
        if (data.details !== undefined) {
            fields.push(`details = $${paramIndex}`);
            values.push(data.details);
            paramIndex++;
        }
        if (data.newsType !== undefined) {
            fields.push(`news_type = $${paramIndex}`);
            values.push(data.newsType);
            paramIndex++;
        }
        if (data.isActive !== undefined) {
            fields.push(`is_active = $${paramIndex}`);
            values.push(data.isActive);
            paramIndex++;
        }
        if (fields.length === 0) {
            return this.findById(id);
        }
        values.push(id);
        const query = `
      UPDATE news
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex} AND deleted_at IS NULL
      RETURNING *
    `;
        const result = await database_1.default.query(query, values);
        const row = result.rows[0];
        return row ? this.mapRowToNews(row) : null;
    }
    static async delete(id) {
        const query = `
      UPDATE news
      SET deleted_at = CURRENT_TIMESTAMP, is_active = false
      WHERE id = $1 AND deleted_at IS NULL
    `;
        const result = await database_1.default.query(query, [id]);
        return (result.rowCount || 0) > 0;
    }
    static async exists(id) {
        const query = 'SELECT EXISTS(SELECT 1 FROM news WHERE id = $1 AND deleted_at IS NULL)';
        const result = await database_1.default.query(query, [id]);
        return result.rows[0].exists;
    }
    static async publish(id) {
        const query = `
      UPDATE news
      SET is_active = true, published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;
        const result = await database_1.default.query(query, [id]);
        const row = result.rows[0];
        return row ? this.mapRowToNews(row) : null;
    }
}
exports.NewsModel = NewsModel;
//# sourceMappingURL=news.model.js.map