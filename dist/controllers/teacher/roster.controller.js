"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherRosterController = void 0;
const database_1 = __importDefault(require("../../config/database"));
const course_model_1 = require("../../models/course.model");
class TeacherRosterController {
    static async listAllStudents(req, res) {
        try {
            const me = req.user;
            if (!me?.id) {
                res.status(401).json({ success: false, message: 'التحقق مطلوب', errors: ['التحقق مطلوب'] });
                return;
            }
            const page = Math.max(parseInt(String(req.query['page'] || '1')), 1);
            const limit = Math.max(parseInt(String(req.query['limit'] || '10')), 1);
            const q = req.query['q']?.trim();
            const params = [String(me.id)];
            let p = 2;
            let where = `u.user_type = 'student' AND u.deleted_at IS NULL AND EXISTS (
        SELECT 1 FROM course_bookings cb
        WHERE cb.student_id = u.id
          AND cb.teacher_id = $1
          AND cb.status = 'confirmed'
          AND cb.is_deleted = false
      )`;
            if (q && q !== '') {
                where += ` AND (u.name ILIKE $${p} OR u.phone ILIKE $${p})`;
                params.push(`%${q}%`);
                p++;
            }
            const countQ = `SELECT COUNT(*) FROM users u WHERE ${where}`;
            const dataQ = `
        SELECT u.id::text AS id, u.name AS name
        FROM users u
        WHERE ${where}
        ORDER BY u.name ASC
        LIMIT $${p} OFFSET $${p + 1}
      `;
            const total = parseInt((await database_1.default.query(countQ, params)).rows[0].count);
            const rows = (await database_1.default.query(dataQ, [...params, limit, (page - 1) * limit])).rows;
            res.status(200).json({
                success: true,
                message: 'قائمة طلاب المعلم',
                data: rows,
                pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            });
        }
        catch (error) {
            console.error('Error listAllStudents:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
        }
    }
    static async listStudentsByCourse(req, res) {
        try {
            const me = req.user;
            if (!me?.id) {
                res.status(401).json({ success: false, message: 'التحقق مطلوب', errors: ['التحقق مطلوب'] });
                return;
            }
            const courseId = String(req.params['courseId'] || '');
            if (!courseId) {
                res.status(400).json({ success: false, message: 'courseId مطلوب' });
                return;
            }
            const own = await course_model_1.CourseModel.findByIdAndTeacher(courseId, String(me.id));
            if (!own) {
                res.status(404).json({ success: false, message: 'الكورس غير موجود أو غير مخوّل' });
                return;
            }
            const q = `
        SELECT u.id::text AS id, u.name AS name
        FROM course_bookings cb
        JOIN users u ON u.id = cb.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
        WHERE cb.course_id = $1 AND cb.teacher_id = $2 AND cb.status = 'confirmed' AND cb.is_deleted = false
        ORDER BY u.name ASC
      `;
            const rows = (await database_1.default.query(q, [courseId, String(me.id)])).rows;
            res.status(200).json({ success: true, message: 'طلاب الكورس', data: rows });
        }
        catch (error) {
            console.error('Error listStudentsByCourse:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
        }
    }
    static async listStudentsBySession(req, res) {
        try {
            const me = req.user;
            if (!me?.id) {
                res.status(401).json({ success: false, message: 'التحقق مطلوب', errors: ['التحقق مطلوب'] });
                return;
            }
            const sessionId = String(req.params['sessionId'] || '');
            if (!sessionId) {
                res.status(400).json({ success: false, message: 'sessionId مطلوب' });
                return;
            }
            const ownQ = `SELECT id FROM sessions WHERE id = $1 AND teacher_id = $2 AND is_deleted = false`;
            const ownR = await database_1.default.query(ownQ, [sessionId, String(me.id)]);
            if (ownR.rowCount === 0) {
                res.status(404).json({ success: false, message: 'الجلسة غير موجودة أو غير مخوّل' });
                return;
            }
            const q = `
        SELECT u.id::text AS id, u.name AS name
        FROM session_attendees sa
        JOIN users u ON u.id = sa.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
        WHERE sa.session_id = $1
        ORDER BY u.name ASC
      `;
            const rows = (await database_1.default.query(q, [sessionId])).rows;
            res.status(200).json({ success: true, message: 'طلاب الجلسة', data: rows });
        }
        catch (error) {
            console.error('Error listStudentsBySession:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
        }
    }
    static async listSessionNames(req, res) {
        try {
            const me = req.user;
            if (!me?.id) {
                res.status(401).json({ success: false, message: 'التحقق مطلوب', errors: ['التحقق مطلوب'] });
                return;
            }
            const courseId = req.query['courseId'] || undefined;
            const params = [String(me.id)];
            let where = 'teacher_id = $1 AND is_deleted = false';
            if (courseId) {
                where += ' AND course_id = $2';
                params.push(courseId);
            }
            const q = `
        SELECT id::text AS id, COALESCE(title, '') AS title, weekday, start_time, end_time
        FROM sessions
        WHERE ${where}
        ORDER BY weekday, start_time
      `;
            const rows = (await database_1.default.query(q, params)).rows;
            res.status(200).json({ success: true, message: 'جلسات المعلم', data: rows });
        }
        catch (error) {
            console.error('Error listSessionNames:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
        }
    }
    static async listCourseNames(req, res) {
        try {
            const me = req.user;
            if (!me?.id) {
                res.status(401).json({ success: false, message: 'التحقق مطلوب', errors: ['التحقق مطلوب'] });
                return;
            }
            const q = `
        SELECT id::text AS id, course_name
        FROM courses
        WHERE teacher_id = $1 AND is_deleted = false
        ORDER BY course_name ASC
      `;
            const rows = (await database_1.default.query(q, [String(me.id)])).rows;
            res.status(200).json({ success: true, message: 'كورسات المعلم', data: rows });
        }
        catch (error) {
            console.error('Error listCourseNames:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
        }
    }
}
exports.TeacherRosterController = TeacherRosterController;
//# sourceMappingURL=roster.controller.js.map