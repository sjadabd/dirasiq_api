"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CourseModel = void 0;
const database_1 = __importDefault(require("../config/database"));
class CourseModel {
    static async create(teacherId, data) {
        const query = `
      INSERT INTO courses (
        teacher_id, study_year, grade_id, subject_id, course_name,
        course_images, description, start_date, end_date, price, seats_count,
        has_reservation, reservation_amount
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;
        const values = [
            teacherId,
            data.study_year,
            data.grade_id,
            data.subject_id,
            data.course_name,
            data.course_images || [],
            data.description,
            data.start_date,
            data.end_date,
            data.price,
            data.seats_count,
            data.has_reservation ?? false,
            data.reservation_amount ?? null
        ];
        const result = await database_1.default.query(query, values);
        return result.rows[0];
    }
    static async findNamesByTeacherAndYear(teacherId, studyYear) {
        const query = `
      SELECT id, course_name
      FROM courses
      WHERE teacher_id = $1
        AND study_year = $2
        AND is_deleted = false
      ORDER BY course_name ASC
    `;
        const r = await database_1.default.query(query, [teacherId, studyYear]);
        return r.rows;
    }
    static async findById(id) {
        const query = 'SELECT * FROM courses WHERE id = $1 AND is_deleted = false';
        const result = await database_1.default.query(query, [id]);
        return result.rows[0] || null;
    }
    static async findByIdAndTeacher(id, teacherId) {
        const query = 'SELECT * FROM courses WHERE id = $1 AND teacher_id = $2 AND is_deleted = false';
        const result = await database_1.default.query(query, [id, teacherId]);
        return result.rows[0] || null;
    }
    static async findAllByTeacher(teacherId, page = 1, limit = 10, search, studyYear, gradeId, subjectId, deleted) {
        let baseWhereClause = 'WHERE teacher_id = $1';
        if (deleted === true) {
            baseWhereClause += ' AND is_deleted = true';
        }
        else if (deleted === false) {
            baseWhereClause += ' AND is_deleted = false';
        }
        let query = `SELECT * FROM courses ${baseWhereClause}`;
        let countQuery = `SELECT COUNT(*) FROM courses ${baseWhereClause}`;
        const params = [teacherId];
        let paramIndex = 2;
        let whereConditions = [];
        if (search && search.trim() !== '' && search !== 'null' && search !== 'undefined') {
            whereConditions.push(`course_name ILIKE $${paramIndex}`);
            params.push(`%${search.trim()}%`);
            paramIndex++;
        }
        if (studyYear && studyYear !== 'null' && studyYear !== 'undefined') {
            whereConditions.push(`study_year = $${paramIndex}`);
            params.push(studyYear);
            paramIndex++;
        }
        if (gradeId && gradeId !== 'null' && gradeId !== 'undefined') {
            whereConditions.push(`grade_id = $${paramIndex}`);
            params.push(gradeId);
            paramIndex++;
        }
        if (subjectId && subjectId !== 'null' && subjectId !== 'undefined') {
            whereConditions.push(`subject_id = $${paramIndex}`);
            params.push(subjectId);
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
            database_1.default.query(countQuery, whereConditions.length > 0 ? [teacherId, ...params.slice(1, whereConditions.length + 1)] : [teacherId])
        ]);
        return {
            courses: result.rows,
            total: parseInt(countResult.rows[0].count)
        };
    }
    static async update(id, teacherId, data) {
        const fields = [];
        const values = [];
        let paramIndex = 1;
        if (data.study_year !== undefined) {
            fields.push(`study_year = $${paramIndex}`);
            values.push(data.study_year);
            paramIndex++;
        }
        if (data.grade_id !== undefined) {
            fields.push(`grade_id = $${paramIndex}`);
            values.push(data.grade_id);
            paramIndex++;
        }
        if (data.subject_id !== undefined) {
            fields.push(`subject_id = $${paramIndex}`);
            values.push(data.subject_id);
            paramIndex++;
        }
        if (data.course_name !== undefined) {
            fields.push(`course_name = $${paramIndex}`);
            values.push(data.course_name);
            paramIndex++;
        }
        if (data.course_images !== undefined) {
            fields.push(`course_images = $${paramIndex}`);
            values.push(data.course_images);
            paramIndex++;
        }
        if (data.description !== undefined) {
            fields.push(`description = $${paramIndex}`);
            values.push(data.description);
            paramIndex++;
        }
        if (data.start_date !== undefined) {
            fields.push(`start_date = $${paramIndex}`);
            values.push(data.start_date);
            paramIndex++;
        }
        if (data.end_date !== undefined) {
            fields.push(`end_date = $${paramIndex}`);
            values.push(data.end_date);
            paramIndex++;
        }
        if (data.price !== undefined) {
            fields.push(`price = $${paramIndex}`);
            values.push(data.price);
            paramIndex++;
        }
        if (data.seats_count !== undefined) {
            fields.push(`seats_count = $${paramIndex}`);
            values.push(data.seats_count);
            paramIndex++;
        }
        if (data.has_reservation !== undefined) {
            fields.push(`has_reservation = $${paramIndex}`);
            values.push(data.has_reservation);
            paramIndex++;
        }
        if (data.reservation_amount !== undefined) {
            fields.push(`reservation_amount = $${paramIndex}`);
            values.push(data.reservation_amount);
            paramIndex++;
        }
        if (fields.length === 0) {
            return this.findByIdAndTeacher(id, teacherId);
        }
        values.push(id, teacherId);
        const query = `
      UPDATE courses
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex} AND teacher_id = $${paramIndex + 1} AND is_deleted = false
      RETURNING *
    `;
        const result = await database_1.default.query(query, values);
        return result.rows[0] || null;
    }
    static async softDelete(id, teacherId) {
        const query = `
      UPDATE courses
      SET is_deleted = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND teacher_id = $2 AND is_deleted = false
    `;
        const result = await database_1.default.query(query, [id, teacherId]);
        return (result.rowCount || 0) > 0;
    }
    static async exists(id) {
        const query = 'SELECT EXISTS(SELECT 1 FROM courses WHERE id = $1 AND is_deleted = false)';
        const result = await database_1.default.query(query, [id]);
        return result.rows[0].exists;
    }
    static async nameExistsForTeacher(teacherId, studyYear, courseName, excludeId) {
        let query;
        const params = [teacherId, studyYear, courseName];
        if (excludeId) {
            query = 'SELECT EXISTS(SELECT 1 FROM courses WHERE teacher_id = $1 AND study_year = $2 AND course_name = $3 AND id != $4 AND is_deleted = false)';
            params.push(excludeId);
        }
        else {
            query = 'SELECT EXISTS(SELECT 1 FROM courses WHERE teacher_id = $1 AND study_year = $2 AND course_name = $3 AND is_deleted = false)';
        }
        const result = await database_1.default.query(query, params);
        return result.rows[0].exists;
    }
    static async courseExistsForTeacher(teacherId, studyYear, courseName, gradeId, subjectId, excludeId) {
        let query;
        const params = [teacherId, studyYear, courseName, gradeId, subjectId];
        if (excludeId) {
            query = 'SELECT EXISTS(SELECT 1 FROM courses WHERE teacher_id = $1 AND study_year = $2 AND course_name = $3 AND grade_id = $4 AND subject_id = $5 AND id != $6 AND is_deleted = false)';
            params.push(excludeId);
        }
        else {
            query = 'SELECT EXISTS(SELECT 1 FROM courses WHERE teacher_id = $1 AND study_year = $2 AND course_name = $3 AND grade_id = $4 AND subject_id = $5 AND is_deleted = false)';
        }
        const result = await database_1.default.query(query, params);
        return result.rows[0].exists;
    }
    static async findByIdWithRelations(id, teacherId) {
        const query = `
      SELECT
        c.*,
        g.name as grade_name,
        s.name as subject_name
      FROM courses c
      LEFT JOIN grades g ON c.grade_id = g.id
      LEFT JOIN subjects s ON c.subject_id = s.id
      WHERE c.id = $1 AND c.teacher_id = $2 AND c.is_deleted = false
    `;
        const result = await database_1.default.query(query, [id, teacherId]);
        return result.rows[0] || null;
    }
    static async findDeletedNotExpiredByTeacher(teacherId, page = 1, limit = 10) {
        const offset = (page - 1) * limit;
        const query = `
      SELECT
        c.*,
        g.name as grade_name,
        s.name as subject_name
      FROM courses c
      LEFT JOIN grades g ON c.grade_id = g.id
      LEFT JOIN subjects s ON c.subject_id = s.id
      WHERE c.teacher_id = $1
        AND c.is_deleted = true
        AND c.end_date > CURRENT_DATE
      ORDER BY c.updated_at DESC
      LIMIT $2 OFFSET $3
    `;
        const countQuery = `
      SELECT COUNT(*) as count
      FROM courses c
      WHERE c.teacher_id = $1
        AND c.is_deleted = true
        AND c.end_date > CURRENT_DATE
    `;
        const [result, countResult] = await Promise.all([
            database_1.default.query(query, [teacherId, limit, offset]),
            database_1.default.query(countQuery, [teacherId])
        ]);
        return {
            courses: result.rows,
            total: parseInt(countResult.rows[0].count)
        };
    }
    static async restore(id, teacherId) {
        const query = `
      UPDATE courses
      SET is_deleted = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND teacher_id = $2 AND is_deleted = true AND end_date > CURRENT_DATE
      RETURNING *
    `;
        const result = await database_1.default.query(query, [id, teacherId]);
        return result.rows[0] || null;
    }
    static async findByGradesAndLocation(gradeIds, studentLocation, maxDistance = 5, limit = 10, offset = 0) {
        const query = `
      SELECT
        c.*,
        u.name as teacher_name,
        u.phone as teacher_phone,
        u.address as teacher_address,
        u.bio as teacher_bio,
        u.experience_years as teacher_experience_years,
        u.profile_image_path as teacher_profile_image_path,
        u.latitude as teacher_latitude,
        u.longitude as teacher_longitude,
        g.name as grade_name,
        s.name as subject_name,
        (
          6371 * acos(
            cos(radians($1)) * cos(radians(u.latitude)) *
            cos(radians(u.longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(u.latitude))
          )
        ) as distance
      FROM courses c
      INNER JOIN users u ON c.teacher_id = u.id
      INNER JOIN grades g ON c.grade_id = g.id
      INNER JOIN subjects s ON c.subject_id = s.id
      WHERE c.grade_id = ANY($3)
        AND c.is_deleted = false
        AND u.user_type = 'teacher'
        AND u.status = 'active'
        AND u.latitude IS NOT NULL
        AND u.longitude IS NOT NULL
        AND (
          6371 * acos(
            cos(radians($1)) * cos(radians(u.latitude)) *
            cos(radians(u.longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(u.latitude))
          )
        ) <= $4
      ORDER BY distance ASC, c.created_at DESC
      LIMIT $5 OFFSET $6
    `;
        const values = [
            studentLocation.latitude,
            studentLocation.longitude,
            gradeIds,
            maxDistance,
            limit,
            offset
        ];
        const result = await database_1.default.query(query, values);
        return result.rows;
    }
}
exports.CourseModel = CourseModel;
//# sourceMappingURL=course.model.js.map