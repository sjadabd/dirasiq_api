"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubjectModel = void 0;
const database_1 = __importDefault(require("../config/database"));
class SubjectModel {
    static async create(teacherId, data) {
        const query = `
      INSERT INTO subjects (teacher_id, name, description)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
        const values = [teacherId, data.name, data.description];
        const result = await database_1.default.query(query, values);
        return this.mapDatabaseSubjectToSubject(result.rows[0]);
    }
    static async findById(id, includeDeleted = false) {
        let query = 'SELECT * FROM subjects WHERE id = $1';
        if (!includeDeleted) {
            query += ' AND deleted_at IS NULL';
        }
        const result = await database_1.default.query(query, [id]);
        return result.rows[0] ? this.mapDatabaseSubjectToSubject(result.rows[0]) : null;
    }
    static async findByIdAndTeacher(id, teacherId, includeDeleted = false) {
        let query = 'SELECT * FROM subjects WHERE id = $1 AND teacher_id = $2';
        if (!includeDeleted) {
            query += ' AND deleted_at IS NULL';
        }
        const result = await database_1.default.query(query, [id, teacherId]);
        return result.rows[0] ? this.mapDatabaseSubjectToSubject(result.rows[0]) : null;
    }
    static async findAllByTeacher(teacherId, page = 1, limit = 10, search, includeDeleted = false) {
        let query = 'SELECT * FROM subjects WHERE teacher_id = $1';
        let countQuery = 'SELECT COUNT(*) FROM subjects WHERE teacher_id = $1';
        const params = [teacherId];
        let paramIndex = 2;
        let whereConditions = [];
        if (includeDeleted === false) {
            whereConditions.push('deleted_at IS NULL');
        }
        else if (includeDeleted === true) {
            whereConditions.push('deleted_at IS NOT NULL');
        }
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
            database_1.default.query(countQuery, whereConditions.length > 0 ? [teacherId, ...params.slice(1, -2)] : [teacherId])
        ]);
        return {
            subjects: result.rows.map((row) => this.mapDatabaseSubjectToSubject(row)),
            total: parseInt(countResult.rows[0].count)
        };
    }
    static async update(id, teacherId, data) {
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
        if (fields.length === 0) {
            return this.findByIdAndTeacher(id, teacherId);
        }
        values.push(id, teacherId);
        const query = `
      UPDATE subjects
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex} AND teacher_id = $${paramIndex + 1}
      RETURNING *
    `;
        const result = await database_1.default.query(query, values);
        return result.rows[0] ? this.mapDatabaseSubjectToSubject(result.rows[0]) : null;
    }
    static async delete(id, teacherId) {
        const query = `
      UPDATE subjects
      SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL
    `;
        const result = await database_1.default.query(query, [id, teacherId]);
        return (result.rowCount || 0) > 0;
    }
    static async restore(id, teacherId) {
        const query = `
      UPDATE subjects
      SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NOT NULL
    `;
        const result = await database_1.default.query(query, [id, teacherId]);
        return (result.rowCount || 0) > 0;
    }
    static async hardDelete(id, teacherId) {
        const query = 'DELETE FROM subjects WHERE id = $1 AND teacher_id = $2';
        const result = await database_1.default.query(query, [id, teacherId]);
        return (result.rowCount || 0) > 0;
    }
    static async exists(id, includeDeleted = false) {
        let query = 'SELECT EXISTS(SELECT 1 FROM subjects WHERE id = $1)';
        if (!includeDeleted) {
            query += ' AND deleted_at IS NULL';
        }
        const result = await database_1.default.query(query, [id]);
        return result.rows[0].exists;
    }
    static async nameExistsForTeacher(teacherId, name, excludeId) {
        let query;
        const params = [teacherId, name];
        if (excludeId) {
            query = 'SELECT EXISTS(SELECT 1 FROM subjects WHERE teacher_id = $1 AND name = $2 AND id != $3 AND deleted_at IS NULL)';
            params.push(excludeId);
        }
        else {
            query = 'SELECT EXISTS(SELECT 1 FROM subjects WHERE teacher_id = $1 AND name = $2 AND deleted_at IS NULL)';
        }
        const result = await database_1.default.query(query, params);
        return result.rows[0].exists;
    }
    static mapDatabaseSubjectToSubject(dbSubject) {
        return {
            id: dbSubject.id,
            teacher_id: dbSubject.teacher_id,
            name: dbSubject.name,
            description: dbSubject.description,
            created_at: dbSubject.created_at,
            updated_at: dbSubject.updated_at,
            deleted_at: dbSubject.deleted_at,
            is_deleted: dbSubject.deleted_at !== null
        };
    }
}
exports.SubjectModel = SubjectModel;
//# sourceMappingURL=subject.model.js.map