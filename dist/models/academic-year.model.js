"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AcademicYearModel = void 0;
const database_1 = __importDefault(require("../config/database"));
class AcademicYearModel {
    static async create(data) {
        const query = `
      INSERT INTO academic_years (year)
      VALUES ($1)
      RETURNING *
    `;
        const result = await database_1.default.query(query, [data.year]);
        return result.rows[0];
    }
    static async findById(id) {
        const query = 'SELECT * FROM academic_years WHERE id = $1';
        const result = await database_1.default.query(query, [id]);
        return result.rows[0] || null;
    }
    static async findByYear(year) {
        const query = 'SELECT * FROM academic_years WHERE year = $1';
        const result = await database_1.default.query(query, [year]);
        return result.rows[0] || null;
    }
    static async findAll(page = 1, limit = 10, search, isActive) {
        let query = 'SELECT * FROM academic_years';
        let countQuery = 'SELECT COUNT(*) FROM academic_years';
        const params = [];
        let paramIndex = 1;
        let whereConditions = [];
        if (search && search.trim() !== '' && search !== 'null' && search !== 'undefined') {
            whereConditions.push(`year ILIKE $${paramIndex}`);
            params.push(`%${search.trim()}%`);
            paramIndex++;
        }
        if (isActive !== undefined) {
            whereConditions.push(`is_active = $${paramIndex}`);
            params.push(isActive);
            paramIndex++;
        }
        if (whereConditions.length > 0) {
            const whereClause = ' WHERE ' + whereConditions.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }
        query += ' ORDER BY created_at DESC';
        const offset = (page - 1) * limit;
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);
        const [result, countResult] = await Promise.all([
            database_1.default.query(query, params),
            database_1.default.query(countQuery, whereConditions.length > 0 ? params.slice(0, whereConditions.length) : [])
        ]);
        return {
            academicYears: result.rows,
            total: parseInt(countResult.rows[0].count)
        };
    }
    static async getActive() {
        const query = 'SELECT * FROM academic_years WHERE is_active = true LIMIT 1';
        const result = await database_1.default.query(query);
        return result.rows[0] || null;
    }
    static async update(id, data) {
        const fields = [];
        const values = [];
        let paramIndex = 1;
        if (data.year !== undefined) {
            fields.push(`year = $${paramIndex}`);
            values.push(data.year);
            paramIndex++;
        }
        if (data.is_active !== undefined) {
            fields.push(`is_active = $${paramIndex}`);
            values.push(data.is_active);
            paramIndex++;
        }
        if (fields.length === 0) {
            return this.findById(id);
        }
        values.push(id);
        const query = `
      UPDATE academic_years
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;
        const result = await database_1.default.query(query, values);
        return result.rows[0] || null;
    }
    static async delete(id) {
        const query = 'DELETE FROM academic_years WHERE id = $1';
        const result = await database_1.default.query(query, [id]);
        return (result.rowCount || 0) > 0;
    }
    static async exists(id) {
        const query = 'SELECT EXISTS(SELECT 1 FROM academic_years WHERE id = $1)';
        const result = await database_1.default.query(query, [id]);
        return result.rows[0].exists;
    }
    static async yearExists(year, excludeId) {
        let query;
        const params = [year];
        if (excludeId) {
            query = 'SELECT EXISTS(SELECT 1 FROM academic_years WHERE year = $1 AND id != $2)';
            params.push(excludeId);
        }
        else {
            query = 'SELECT EXISTS(SELECT 1 FROM academic_years WHERE year = $1)';
        }
        const result = await database_1.default.query(query, params);
        return result.rows[0].exists;
    }
    static async activate(id) {
        await database_1.default.query('UPDATE academic_years SET is_active = false');
        const query = `
      UPDATE academic_years
      SET is_active = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
        const result = await database_1.default.query(query, [id]);
        return result.rows[0] || null;
    }
}
exports.AcademicYearModel = AcademicYearModel;
//# sourceMappingURL=academic-year.model.js.map