"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherStudentEvaluationController = void 0;
const student_evaluation_service_1 = require("../../services/student-evaluation.service");
class TeacherStudentEvaluationController {
    static getService() { return new student_evaluation_service_1.StudentEvaluationService(); }
    static async bulkUpsert(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const { eval_date, items } = req.body || {};
            if (!eval_date || !Array.isArray(items) || items.length === 0) {
                res.status(400).json({ success: false, message: 'eval_date و items مطلوبة' });
                return;
            }
            const svc = TeacherStudentEvaluationController.getService();
            const rows = await svc.upsertMany(String(me.id), String(eval_date), items);
            try {
                const notif = req.app.get('notificationService');
                for (const ev of rows) {
                    await notif.createAndSendNotification({
                        title: 'تم تقييمك من قبل المعلم',
                        message: `تم تسجيل/تحديث تقييمك بتاريخ ${new Date(ev.eval_date).toLocaleDateString()}`,
                        type: 'teacher_message',
                        priority: 'medium',
                        recipientType: 'specific_students',
                        recipientIds: [String(ev.student_id)],
                        data: {
                            subType: 'student_evaluation',
                            evaluationId: String(ev.id),
                            evalDate: ev.eval_date,
                            ratings: {
                                scientific_level: ev.scientific_level,
                                behavioral_level: ev.behavioral_level,
                                attendance_level: ev.attendance_level,
                                homework_preparation: ev.homework_preparation,
                                participation_level: ev.participation_level,
                                instruction_following: ev.instruction_following,
                            },
                            guidance: ev.guidance ?? null,
                            notes: ev.notes ?? null,
                        },
                        createdBy: String(me.id),
                    });
                }
            }
            catch (e) {
                console.error('Error sending evaluation notifications:', e);
            }
            res.status(200).json({ success: true, data: rows });
        }
        catch (error) {
            console.error('Error bulk upsert evaluations:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async update(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const id = String(req.params['id']);
            const svc = TeacherStudentEvaluationController.getService();
            const current = await svc.getById(id);
            if (!current) {
                res.status(404).json({ success: false, message: 'غير موجود' });
                return;
            }
            if (String(current.teacher_id) !== String(me.id)) {
                res.status(403).json({ success: false, message: 'غير مصرح' });
                return;
            }
            const updated = await svc.update(id, req.body || {});
            try {
                if (updated) {
                    const notif = req.app.get('notificationService');
                    await notif.createAndSendNotification({
                        title: 'تم تحديث تقييمك',
                        message: `قام المعلم بتحديث تقييمك بتاريخ ${new Date(updated.eval_date).toLocaleDateString()}`,
                        type: 'teacher_message',
                        priority: 'medium',
                        recipientType: 'specific_students',
                        recipientIds: [String(updated.student_id)],
                        data: {
                            subType: 'student_evaluation',
                            evaluationId: String(updated.id),
                            evalDate: updated.eval_date,
                        },
                        createdBy: String(me.id),
                    });
                }
            }
            catch (e) {
                console.error('Error sending evaluation update notification:', e);
            }
            res.status(200).json({ success: true, data: updated });
        }
        catch (error) {
            console.error('Error update evaluation:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async list(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const { studentId, from, to } = req.query || {};
            const page = parseInt(String(req.query['page'] ?? '1'), 10);
            const limit = parseInt(String(req.query['limit'] ?? '20'), 10);
            const svc = TeacherStudentEvaluationController.getService();
            const filters = { page, limit };
            if (studentId)
                filters.studentId = String(studentId);
            if (from)
                filters.from = String(from);
            if (to)
                filters.to = String(to);
            const result = await svc.listForTeacher(String(me.id), filters);
            const rows = result.data;
            const studentIds = Array.from(new Set(rows.map(r => String(r.student_id)))).filter(Boolean);
            if (studentIds.length > 0) {
                const pool = require('../../config/database').default || require('../../config/database');
                const q = `
          SELECT u.id::text AS student_id,
                 u.name AS student_name,
                 (
                   SELECT c.course_name
                   FROM course_bookings cb
                   JOIN courses c ON c.id = cb.course_id
                   WHERE cb.teacher_id = $1
                     AND cb.student_id = u.id
                     AND cb.status = 'confirmed'
                     AND cb.is_deleted = false
                   ORDER BY cb.created_at DESC
                   LIMIT 1
                 ) AS course_name
          FROM users u
          WHERE u.id = ANY($2::uuid[])
        `;
                const info = await pool.query(q, [String(me.id), studentIds]);
                const mapInfo = new Map();
                for (const r of info.rows) {
                    mapInfo.set(String(r.student_id), { student_name: r.student_name || null, course_name: r.course_name || null });
                }
                for (const item of rows) {
                    const mi = mapInfo.get(String(item.student_id));
                    item.student_name = mi?.student_name ?? null;
                    item.course_name = mi?.course_name ?? null;
                }
            }
            res.status(200).json({ success: true, data: rows, pagination: { page, limit, total: result.total } });
        }
        catch (error) {
            console.error('Error list evaluations:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async getById(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const id = String(req.params['id']);
            const svc = TeacherStudentEvaluationController.getService();
            const item = await svc.getById(id);
            if (!item) {
                res.status(404).json({ success: false, message: 'غير موجود' });
                return;
            }
            if (String(item.teacher_id) !== String(me.id)) {
                res.status(403).json({ success: false, message: 'غير مصرح' });
                return;
            }
            res.status(200).json({ success: true, data: item });
        }
        catch (error) {
            console.error('Error get evaluation:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async studentsWithEvaluation(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const dateRaw = String(req.query['date'] || '');
            const courseId = req.query['courseId'] ? String(req.query['courseId']) : undefined;
            const sessionId = req.query['sessionId'] ? String(req.query['sessionId']) : undefined;
            const page = parseInt(String(req.query['page'] ?? '1'), 10);
            const limit = parseInt(String(req.query['limit'] ?? '50'), 10);
            if (!dateRaw) {
                res.status(400).json({ success: false, message: 'حقل التاريخ مطلوب (date)' });
                return;
            }
            if (!courseId && !sessionId) {
                res.status(400).json({ success: false, message: 'الفلترة مطلوبة عبر courseId أو sessionId' });
                return;
            }
            const pool = require('../../config/database').default || require('../../config/database');
            const offset = (page - 1) * limit;
            const whereParts = [];
            const params = [String(me.id), dateRaw];
            let p = 3;
            if (sessionId) {
                whereParts.push(`sa.session_id = $${p}`);
                params.push(sessionId);
                p++;
            }
            if (courseId) {
                whereParts.push(`(cb.course_id = $${p} AND cb.teacher_id = $1 AND cb.status = 'confirmed' AND cb.is_deleted = false)`);
                params.push(courseId);
                p++;
            }
            const q = `
        WITH targeted AS (
          ${sessionId ? `
            SELECT DISTINCT sa.student_id
            FROM session_attendees sa
            WHERE sa.session_id = $3
          ` : ''}
          ${sessionId && courseId ? 'UNION' : ''}
          ${courseId ? `
            SELECT DISTINCT cb.student_id
            FROM course_bookings cb
            WHERE cb.course_id = $${sessionId ? 4 : 3}
              AND cb.teacher_id = $1
              AND cb.status = 'confirmed'
              AND cb.is_deleted = false
          ` : ''}
        )
        SELECT u.id::text AS student_id, u.name AS student_name,
               se.id::text AS evaluation_id,
               se.eval_date,
               se.scientific_level, se.behavioral_level, se.attendance_level,
               se.homework_preparation, se.participation_level, se.instruction_following,
               se.guidance, se.notes
        FROM targeted t
        JOIN users u ON u.id = t.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
        LEFT JOIN student_evaluations se
          ON se.student_id = u.id
         AND se.teacher_id = $1
         AND se.eval_date_date = DATE($2)
        ORDER BY u.name ASC
        LIMIT $${sessionId && courseId ? 5 : 4} OFFSET $${sessionId && courseId ? 6 : 5}
      `;
            const qParams = [String(me.id), dateRaw];
            if (sessionId)
                qParams.push(sessionId);
            if (courseId)
                qParams.push(courseId);
            qParams.push(limit, offset);
            const rows = (await pool.query(q, qParams)).rows;
            res.status(200).json({ success: true, data: rows, pagination: { page, limit, total: rows.length } });
        }
        catch (error) {
            console.error('Error list students with evaluation:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
}
exports.TeacherStudentEvaluationController = TeacherStudentEvaluationController;
//# sourceMappingURL=student-evaluation.controller.js.map