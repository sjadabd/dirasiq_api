"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GradeModel = void 0;
const database_1 = __importDefault(require("../config/database"));
class GradeModel {
    static async create(data) {
        const query = `
      INSERT INTO grades (name, description, is_active)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
        const values = [data.name, data.description, data.isActive !== false];
        const result = await database_1.default.query(query, values);
        return this.mapDatabaseGradeToGrade(result.rows[0]);
    }
    static async findById(id) {
        const query = 'SELECT * FROM grades WHERE id = $1 AND deleted_at IS NULL';
        const result = await database_1.default.query(query, [id]);
        if (result.rows.length === 0)
            return null;
        return this.mapDatabaseGradeToGrade(result.rows[0]);
    }
    static async findAll(page = 1, limit = 10, search) {
        let query = 'SELECT * FROM grades WHERE deleted_at IS NULL';
        let countQuery = 'SELECT COUNT(*) FROM grades WHERE deleted_at IS NULL';
        const params = [];
        let paramIndex = 1;
        let whereConditions = [];
        if (search && search.trim() !== '' && search !== 'null' && search !== 'undefined') {
            whereConditions.push(`name ILIKE $${paramIndex}`);
            params.push(`%${search.trim()}%`);
            paramIndex++;
        }
        if (whereConditions.length > 0) {
            const whereClause = ' AND ' + whereConditions.join(' AND ');
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
            grades: result.rows.map(row => this.mapDatabaseGradeToGrade(row)),
            total: parseInt(countResult.rows[0].count)
        };
    }
    static async findActive() {
        const query = 'SELECT * FROM grades WHERE is_active = true AND deleted_at IS NULL ORDER BY name ASC';
        const result = await database_1.default.query(query);
        return result.rows.map(row => this.mapDatabaseGradeToGrade(row));
    }
    static async update(id, data) {
        const fields = [];
        const values = [];
        let paramIndex = 1;
        if (data.name !== undefined) {
            fields.push(`name = $${paramIndex}`);
            values.push(data.name);
            paramIndex++;
        }
        if (data.description !== undefined) {
            fields.push(`description = $${paramIndex}`);
            values.push(data.description);
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
      UPDATE grades
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;
        const result = await database_1.default.query(query, values);
        if (result.rows.length === 0)
            return null;
        return this.mapDatabaseGradeToGrade(result.rows[0]);
    }
    static async delete(id) {
        const query = `
      UPDATE grades
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `;
        const result = await database_1.default.query(query, [id]);
        return (result.rowCount || 0) > 0;
    }
    static async exists(id) {
        const query = 'SELECT EXISTS(SELECT 1 FROM grades WHERE id = $1 AND deleted_at IS NULL)';
        const result = await database_1.default.query(query, [id]);
        return result.rows[0].exists;
    }
    static async nameExists(name, excludeId) {
        let query;
        const params = [name];
        if (excludeId) {
            query = 'SELECT EXISTS(SELECT 1 FROM grades WHERE name = $1 AND id != $2 AND deleted_at IS NULL)';
            params.push(excludeId);
        }
        else {
            query = 'SELECT EXISTS(SELECT 1 FROM grades WHERE name = $1 AND deleted_at IS NULL)';
        }
        const result = await database_1.default.query(query, params);
        return result.rows[0].exists;
    }
    static mapDatabaseGradeToGrade(dbGrade) {
        return {
            id: dbGrade.id,
            name: dbGrade.name,
            description: dbGrade.description,
            isActive: dbGrade.is_active,
            createdAt: dbGrade.created_at,
            updatedAt: dbGrade.updated_at,
        };
    }
}
exports.GradeModel = GradeModel;
//# sourceMappingURL=grade.model.js.map