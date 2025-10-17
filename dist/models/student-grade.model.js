"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentGradeModel = void 0;
const database_1 = __importDefault(require("../config/database"));
class StudentGradeModel {
    static async create(data) {
        const query = `
    INSERT INTO student_grades (student_id, grade_id, study_year)
    VALUES ($1, $2, $3)
    ON CONFLICT (student_id, grade_id, study_year)
    DO UPDATE SET
      grade_id = EXCLUDED.grade_id,  -- أو أي عمود تحب تحدّثه
      updated_at = NOW()
    RETURNING *
  `;
        const values = [data.studentId, data.gradeId, data.studyYear];
        const result = await database_1.default.query(query, values);
        return this.mapDatabaseStudentGradeToStudentGrade(result.rows[0]);
    }
    static async findById(id) {
        const query = 'SELECT * FROM student_grades WHERE id = $1 AND deleted_at IS NULL';
        const result = await database_1.default.query(query, [id]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapDatabaseStudentGradeToStudentGrade(result.rows[0]);
    }
    static async findByStudentId(studentId) {
        const query = 'SELECT * FROM student_grades WHERE student_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC';
        const result = await database_1.default.query(query, [studentId]);
        return result.rows.map((row) => this.mapDatabaseStudentGradeToStudentGrade(row));
    }
    static async findActiveByStudentId(studentId) {
        const query = 'SELECT * FROM student_grades WHERE student_id = $1 AND is_active = true AND deleted_at IS NULL ORDER BY created_at DESC';
        const result = await database_1.default.query(query, [studentId]);
        return result.rows.map((row) => this.mapDatabaseStudentGradeToStudentGrade(row));
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
      UPDATE student_grades
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
        const result = await database_1.default.query(query, values);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapDatabaseStudentGradeToStudentGrade(result.rows[0]);
    }
    static async delete(id) {
        const query = `
      UPDATE student_grades
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
      SELECT COUNT(*) FROM student_grades
      ${whereClause}
      ${searchClause}
    `;
        const dataQuery = `
      SELECT * FROM student_grades
      ${whereClause}
      ${searchClause}
      ORDER BY ${sortKey} ${sortOrder.toUpperCase()}
      LIMIT $${searchValues.length + 1} OFFSET $${searchValues.length + 2}
    `;
        const countResult = await database_1.default.query(countQuery, searchValues);
        const total = parseInt(countResult.rows[0].count);
        const dataResult = await database_1.default.query(dataQuery, [...searchValues, limit, offset]);
        const studentGrades = dataResult.rows.map((row) => this.mapDatabaseStudentGradeToStudentGrade(row));
        return {
            studentGrades,
            total,
            totalPages: Math.ceil(total / limit)
        };
    }
    static async findByGradeAndStudyYear(gradeId, studyYear) {
        const query = `
      SELECT * FROM student_grades
      WHERE grade_id = $1
        AND study_year = $2
        AND is_active = true
        AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;
        const result = await database_1.default.query(query, [gradeId, studyYear]);
        return result.rows.map((row) => this.mapDatabaseStudentGradeToStudentGrade(row));
    }
    static mapDatabaseStudentGradeToStudentGrade(dbStudentGrade) {
        return {
            id: dbStudentGrade.id,
            studentId: dbStudentGrade.student_id,
            gradeId: dbStudentGrade.grade_id,
            studyYear: dbStudentGrade.study_year,
            isActive: dbStudentGrade.is_active,
            createdAt: dbStudentGrade.created_at,
            updatedAt: dbStudentGrade.updated_at,
        };
    }
}
exports.StudentGradeModel = StudentGradeModel;
//# sourceMappingURL=student-grade.model.js.map