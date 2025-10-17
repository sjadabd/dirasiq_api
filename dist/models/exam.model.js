"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExamModel = void 0;
const database_1 = __importDefault(require("../config/database"));
class ExamModel {
    static async create(data) {
        const q = `
      INSERT INTO exams (course_id, subject_id, teacher_id, exam_date, exam_type, max_score, description, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *;
    `;
        const r = await database_1.default.query(q, [
            data.course_id,
            data.subject_id,
            data.teacher_id,
            data.exam_date,
            data.exam_type,
            data.max_score,
            data.description ?? null,
            data.notes ?? null,
        ]);
        return r.rows[0];
    }
    static async update(id, patch) {
        const q = `
      UPDATE exams SET
        exam_date = COALESCE($2, exam_date),
        exam_type = COALESCE($3, exam_type),
        max_score = COALESCE($4, max_score),
        description = COALESCE($5, description),
        notes = COALESCE($6, notes),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
        const r = await database_1.default.query(q, [
            id,
            patch.exam_date ?? null,
            patch.exam_type ?? null,
            patch.max_score ?? null,
            patch.description ?? null,
            patch.notes ?? null,
        ]);
        return r.rows[0] || null;
    }
    static async remove(id) {
        const r = await database_1.default.query('DELETE FROM exams WHERE id = $1', [id]);
        return (r.rowCount ?? 0) > 0;
    }
    static async getById(id) {
        const q = `
      SELECT
        e.*,
        COALESCE(
          JSON_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'id', s.id::text,
              'title', s.title,
              'weekday', s.weekday,
              'start_time', s.start_time,
              'end_time', s.end_time,
              'state', s.state
            )
          ) FILTER (WHERE s.id IS NOT NULL),
          '[]'
        ) AS sessions
      FROM exams e
      LEFT JOIN exam_sessions es ON es.exam_id = e.id
      LEFT JOIN sessions s ON s.id = es.session_id AND s.is_deleted = false
      WHERE e.id = $1
      GROUP BY e.id
    `;
        const r = await database_1.default.query(q, [id]);
        return r.rows[0] || null;
    }
    static async listByTeacher(teacherId, page = 1, limit = 20, type) {
        const offset = (page - 1) * limit;
        const params = [teacherId];
        let where = 'e.teacher_id = $1';
        if (type) {
            params.push(type);
            where += ` AND e.exam_type = $${params.length}`;
        }
        params.push(limit, offset);
        const dataQ = `
      SELECT
        e.*,
        COALESCE(
          JSON_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'id', s.id::text,
              'title', s.title,
              'weekday', s.weekday,
              'start_time', s.start_time,
              'end_time', s.end_time,
              'state', s.state
            )
          ) FILTER (WHERE s.id IS NOT NULL),
          '[]'
        ) AS sessions
      FROM exams e
      LEFT JOIN exam_sessions es ON es.exam_id = e.id
      LEFT JOIN sessions s ON s.id = es.session_id AND s.is_deleted = false
      WHERE ${where}
      GROUP BY e.id
      ORDER BY e.exam_date DESC, e.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
        const rows = (await database_1.default.query(dataQ, params)).rows;
        const cntParams = [teacherId];
        let cntWhere = 'teacher_id = $1';
        if (type) {
            cntParams.push(type);
            cntWhere += ` AND exam_type = $${cntParams.length}`;
        }
        const total = parseInt((await database_1.default.query(`SELECT COUNT(*)::int AS c FROM exams WHERE ${cntWhere}`, cntParams)).rows[0].c);
        return { data: rows, total };
    }
    static async listForStudent(studentId, page = 1, limit = 20, type) {
        const offset = (page - 1) * limit;
        const params = [studentId];
        const whereCourse = `EXISTS (
      SELECT 1 FROM course_bookings cb
      WHERE cb.student_id = $1 AND cb.course_id = e.course_id AND cb.teacher_id = e.teacher_id AND cb.status = 'confirmed' AND cb.is_deleted = false
    )`;
        const whereSession = `OR EXISTS (
      SELECT 1 FROM exam_sessions es
      JOIN session_attendees sa ON sa.session_id = es.session_id AND sa.student_id = $1
      WHERE es.exam_id = e.id
    )`;
        const whereGrade = `OR EXISTS (
      SELECT 1 FROM exam_grades eg WHERE eg.student_id = $1 AND eg.exam_id = e.id
    )`;
        let where = `(${whereCourse} ${whereSession} ${whereGrade})`;
        if (type) {
            params.push(type);
            where += ` AND e.exam_type = $${params.length}`;
        }
        params.push(limit, offset);
        const dataQ = `SELECT e.* FROM exams e WHERE ${where} ORDER BY e.exam_date DESC, e.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
        const rows = (await database_1.default.query(dataQ, params)).rows;
        const cntParams = [studentId];
        let cntWhere = `(${whereCourse} ${whereSession} ${whereGrade})`;
        if (type) {
            cntParams.push(type);
            cntWhere += ` AND e.exam_type = $${cntParams.length}`;
        }
        const total = parseInt((await database_1.default.query(`SELECT COUNT(*)::int AS c FROM exams e WHERE ${cntWhere}`, cntParams)).rows[0].c);
        return { data: rows, total };
    }
    static async setGrade(examId, studentId, score, gradedBy) {
        const q = `
      INSERT INTO exam_grades (exam_id, student_id, score, graded_at, graded_by)
      VALUES ($1,$2,$3,NOW(),$4)
      ON CONFLICT (exam_id, student_id) DO UPDATE SET score = EXCLUDED.score, graded_at = NOW(), graded_by = EXCLUDED.graded_by
      RETURNING *;
    `;
        const r = await database_1.default.query(q, [examId, studentId, score, gradedBy]);
        return r.rows[0];
    }
    static async getGrade(examId, studentId) {
        const r = await database_1.default.query('SELECT * FROM exam_grades WHERE exam_id=$1 AND student_id=$2', [examId, studentId]);
        return r.rows[0] || null;
    }
    static async listGrades(examId) {
        const r = await database_1.default.query('SELECT * FROM exam_grades WHERE exam_id=$1 ORDER BY graded_at DESC NULLS LAST, created_at DESC NULLS LAST', [examId]);
        return r.rows;
    }
    static async listStudentsForExam(exam) {
        const qSessions = `
      SELECT DISTINCT u.id::text AS id, u.name AS name
      FROM exam_sessions es
      JOIN session_attendees sa ON sa.session_id = es.session_id
      JOIN users u ON u.id = sa.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
      WHERE es.exam_id = $1
      ORDER BY u.name ASC
    `;
        const srows = (await database_1.default.query(qSessions, [String(exam.id)])).rows;
        if (srows.length > 0)
            return srows;
        const qCourse = `
      SELECT u.id::text AS id, u.name AS name
      FROM course_bookings cb
      JOIN users u ON u.id = cb.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
      WHERE cb.course_id = $1 AND cb.teacher_id = $2 AND cb.status = 'confirmed' AND cb.is_deleted = false
      ORDER BY u.name ASC
    `;
        const rows = (await database_1.default.query(qCourse, [String(exam.course_id), String(exam.teacher_id)])).rows;
        return rows;
    }
    static async addExamSessions(examId, sessionIds) {
        if (!sessionIds || sessionIds.length === 0)
            return 0;
        const values = [];
        const params = [];
        let p = 1;
        for (const sid of sessionIds) {
            values.push(examId, sid);
            params.push(`($${p}, $${p + 1})`);
            p += 2;
        }
        const q = `INSERT INTO exam_sessions (exam_id, session_id) VALUES ${params.join(', ')} ON CONFLICT DO NOTHING`;
        const r = await database_1.default.query(q, values);
        return r.rowCount || 0;
    }
}
exports.ExamModel = ExamModel;
//# sourceMappingURL=exam.model.js.map