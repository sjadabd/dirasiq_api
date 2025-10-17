"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherGradeModel = void 0;
const database_1 = __importDefault(require("../config/database"));
class TeacherGradeModel {
    static async create(data) {
        const query = `
      INSERT INTO teacher_grades (teacher_id, grade_id, study_year)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
        const values = [data.teacherId, data.gradeId, data.studyYear];
        const result = await database_1.default.query(query, values);
        return this.mapDatabaseTeacherGradeToTeacherGrade(result.rows[0]);
    }
    static async createMany(teacherId, gradeIds, studyYear) {
        const teacherGrades = [];
        for (const gradeId of gradeIds) {
            try {
                const teacherGrade = await this.create({
                    teacherId,
                    gradeId,
                    studyYear
                });
                teacherGrades.push(teacherGrade);
            }
            catch (error) {
                console.error(`Error creating teacher grade for grade ${gradeId}:`, error);
            }
        }
        return teacherGrades;
    }
    static async findById(id) {
        const query = 'SELECT * FROM teacher_grades WHERE id = $1 AND deleted_at IS NULL';
        const result = await database_1.default.query(query, [id]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapDatabaseTeacherGradeToTeacherGrade(result.rows[0]);
    }
    static async findByTeacherId(teacherId) {
        const query = 'SELECT * FROM teacher_grades WHERE teacher_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC';
        const result = await database_1.default.query(query, [teacherId]);
        return result.rows.map((row) => this.mapDatabaseTeacherGradeToTeacherGrade(row));
    }
    static async findActiveByTeacherId(teacherId) {
        const query = 'SELECT * FROM teacher_grades WHERE teacher_id = $1 AND is_active = true AND deleted_at IS NULL ORDER BY created_at DESC';
        const result = await database_1.default.query(query, [teacherId]);
        return result.rows.map((row) => this.mapDatabaseTeacherGradeToTeacherGrade(row));
    }
    static async update(id, updateData) {
        const allowedFields = ['grade_id', 'study_year', 'is_active'];
        const updates = [];
        const values = [];
        let paramCount = 1;
        for (const [key, value] of Object.entries(updateData)) {
            if (allowedFields.includes(key) && value !== undefined) {
                updates.push(`${key} = $${paramCount}`);
                values.push(value);
                paramCount++;
            }
        }
        if (updates.length === 0) {
            return null;
        }
        updates.push(`updated_at = $${paramCount}`);
        values.push(new Date());
        values.push(id);
        const query = `
      UPDATE teacher_grades
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
        const result = await database_1.default.query(query, values);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapDatabaseTeacherGradeToTeacherGrade(result.rows[0]);
    }
    static async delete(id) {
        const query = `
      UPDATE teacher_grades
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `;
        const result = await database_1.default.query(query, [id]);
        return (result.rowCount || 0) > 0;
    }
    static async findAll(params) {
        const page = params.page || 1;
        const limit = params.limit || 10;
        const offset = (page - 1) * limit;
        let whereClause = params.deleted ? 'WHERE deleted_at IS NOT NULL' : 'WHERE deleted_at IS NULL';
        let searchClause = '';
        let searchValues = [];
        if (params.search) {
            searchClause = `AND (study_year ILIKE $1)`;
            searchValues.push(`%${params.search}%`);
        }
        const sortKey = params.sortBy?.key || 'created_at';
        const sortOrder = params.sortBy?.order || 'desc';
        const countQuery = `
      SELECT COUNT(*) FROM teacher_grades
      ${whereClause}
      ${searchClause}
    `;
        const dataQuery = `
      SELECT * FROM teacher_grades
      ${whereClause}
      ${searchClause}
      ORDER BY ${sortKey} ${sortOrder.toUpperCase()}
      LIMIT $${searchValues.length + 1} OFFSET $${searchValues.length + 2}
    `;
        const countResult = await database_1.default.query(countQuery, searchValues);
        const total = parseInt(countResult.rows[0].count);
        const dataResult = await database_1.default.query(dataQuery, [...searchValues, limit, offset]);
        const teacherGrades = dataResult.rows.map((row) => this.mapDatabaseTeacherGradeToTeacherGrade(row));
        return {
            teacherGrades,
            total,
            totalPages: Math.ceil(total / limit)
        };
    }
    static mapDatabaseTeacherGradeToTeacherGrade(dbTeacherGrade) {
        return {
            id: dbTeacherGrade.id,
            teacherId: dbTeacherGrade.teacher_id,
            gradeId: dbTeacherGrade.grade_id,
            studyYear: dbTeacherGrade.study_year,
            isActive: dbTeacherGrade.is_active,
            createdAt: dbTeacherGrade.created_at,
            updatedAt: dbTeacherGrade.updated_at,
        };
    }
}
exports.TeacherGradeModel = TeacherGradeModel;
//# sourceMappingURL=teacher-grade.model.js.map