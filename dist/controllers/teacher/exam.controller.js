"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherExamController = void 0;
const academic_year_model_1 = require("../../models/academic-year.model");
const exam_model_1 = require("../../models/exam.model");
const exam_service_1 = require("../../services/exam.service");
class TeacherExamController {
    static getService() { return new exam_service_1.ExamService(); }
    static async create(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const { course_id, subject_id, sessionIds, exam_date, exam_type, max_score, description, notes } = req.body || {};
            if (!course_id || !subject_id || !exam_date || !exam_type || !max_score) {
                res.status(400).json({ success: false, message: 'course_id, subject_id, exam_date, exam_type, max_score مطلوبة' });
                return;
            }
            const type = String(exam_type).toLowerCase() === 'monthly' ? 'monthly' : 'daily';
            const service = TeacherExamController.getService();
            const ex = await service.createExam({
                course_id: String(course_id),
                subject_id: String(subject_id),
                teacher_id: String(me.id),
                exam_date: String(exam_date),
                exam_type: type,
                max_score: Number(max_score),
                description: description ?? null,
                notes: notes ?? null,
            });
            const targetSessions = Array.isArray(sessionIds) ? sessionIds.map((s) => String(s)) : [];
            if (targetSessions.length) {
                await exam_model_1.ExamModel.addExamSessions(String(ex.id), targetSessions);
            }
            await TeacherExamController.notifyExamCreated(req, ex);
            res.status(201).json({ success: true, data: ex });
        }
        catch (error) {
            console.error('Error create exam:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async notifyExamCreated(req, exam) {
        try {
            const notif = req.app.get('notificationService');
            const students = await exam_model_1.ExamModel.listStudentsForExam(exam);
            const recipientIds = students.map(s => String(s.id));
            if (!recipientIds.length)
                return;
            const activeYear = await academic_year_model_1.AcademicYearModel.getActive();
            await notif.createAndSendNotification({
                title: 'امتحان جديد',
                message: `تمت إضافة امتحان جديد بتاريخ ${exam.exam_date}`,
                type: 'class_reminder',
                priority: 'medium',
                recipientType: 'specific_students',
                recipientIds,
                data: {
                    examId: String(exam.id),
                    examType: String(exam.exam_type),
                    courseId: String(exam.course_id),
                    subType: 'exam',
                    studyYear: activeYear?.year || null,
                },
                createdBy: String(exam.teacher_id),
            });
        }
        catch (e) {
            console.error('Error sending exam creation notification:', e);
        }
    }
    static async list(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const page = parseInt(String(req.query['page'] ?? '1'), 10);
            const limit = parseInt(String(req.query['limit'] ?? '20'), 10);
            const type = req.query['type'];
            const service = TeacherExamController.getService();
            const result = await service.listByTeacher(String(me.id), page, limit, type);
            res.status(200).json({ success: true, data: result.data, pagination: { page, limit, total: result.total } });
        }
        catch (error) {
            console.error('Error list exams:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async getById(req, res) {
        try {
            const id = String(req.params['id']);
            const service = TeacherExamController.getService();
            const item = await service.getById(id);
            if (!item) {
                res.status(404).json({ success: false, message: 'غير موجود' });
                return;
            }
            res.status(200).json({ success: true, data: item });
        }
        catch (error) {
            console.error('Error get exam:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async update(req, res) {
        try {
            const id = String(req.params['id']);
            const service = TeacherExamController.getService();
            const patch = req.body || {};
            if (patch.exam_type) {
                patch.exam_type = String(patch.exam_type).toLowerCase() === 'monthly' ? 'monthly' : 'daily';
            }
            const updated = await service.updateExam(id, patch);
            if (!updated) {
                res.status(404).json({ success: false, message: 'غير موجود' });
                return;
            }
            res.status(200).json({ success: true, data: updated });
        }
        catch (error) {
            console.error('Error update exam:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async remove(req, res) {
        try {
            const id = String(req.params['id']);
            const service = TeacherExamController.getService();
            const ok = await service.removeExam(id);
            if (!ok) {
                res.status(404).json({ success: false, message: 'غير موجود' });
                return;
            }
            res.status(200).json({ success: true, message: 'تم الحذف' });
        }
        catch (error) {
            console.error('Error delete exam:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async students(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const id = String(req.params['id']);
            const service = TeacherExamController.getService();
            const item = await service.getById(id);
            if (!item) {
                res.status(404).json({ success: false, message: 'غير موجود' });
                return;
            }
            if (String(item.teacher_id) !== String(me.id)) {
                res.status(403).json({ success: false, message: 'غير مصرح' });
                return;
            }
            const sessionId = req.query['sessionId'] ? String(req.query['sessionId']) : undefined;
            if (sessionId) {
                const linkedQ = `SELECT 1 FROM exam_sessions WHERE exam_id = $1 AND session_id = $2 LIMIT 1`;
                const { default: _unused } = { default: null };
                const pool = require('../../config/database').default || require('../../config/database');
                const linkRes = await pool.query(linkedQ, [id, sessionId]);
                if (linkRes.rowCount === 0) {
                    res.status(400).json({ success: false, message: 'الجلسة غير مرتبطة بهذا الامتحان' });
                    return;
                }
                const q = `
          SELECT u.id::text AS id, u.name AS name,
                 eg.score, eg.graded_at, eg.graded_by
          FROM session_attendees sa
          JOIN users u ON u.id = sa.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
          LEFT JOIN exam_grades eg ON eg.exam_id = $1 AND eg.student_id = u.id
          WHERE sa.session_id = $2
          ORDER BY u.name ASC
        `;
                const rows = (await pool.query(q, [id, sessionId])).rows;
                res.status(200).json({ success: true, data: rows });
                return;
            }
            const pool = require('../../config/database').default || require('../../config/database');
            const q = `
        WITH targeted AS (
          SELECT DISTINCT sa.student_id
          FROM exam_sessions es
          JOIN session_attendees sa ON sa.session_id = es.session_id
          WHERE es.exam_id = $1
          UNION
          SELECT cb.student_id
          FROM course_bookings cb
          WHERE cb.course_id = $2 AND cb.teacher_id = $3 AND cb.status = 'confirmed' AND cb.is_deleted = false
        )
        SELECT u.id::text AS id, u.name AS name,
               eg.score, eg.graded_at, eg.graded_by
        FROM targeted t
        JOIN users u ON u.id = t.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
        LEFT JOIN exam_grades eg ON eg.exam_id = $1 AND eg.student_id = u.id
        ORDER BY u.name ASC
      `;
            const rows = (await pool.query(q, [id, String(item.course_id), String(item.teacher_id)])).rows;
            res.status(200).json({ success: true, data: rows });
        }
        catch (error) {
            console.error('Error exam students:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async grade(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const examId = String(req.params['examId']);
            const studentId = String(req.params['studentId']);
            const { score } = req.body || {};
            const service = TeacherExamController.getService();
            const exam = await service.getById(examId);
            if (!exam) {
                res.status(404).json({ success: false, message: 'غير موجود' });
                return;
            }
            if (String(exam.teacher_id) !== String(me.id)) {
                res.status(403).json({ success: false, message: 'غير مصرح' });
                return;
            }
            const numericScore = Number(score);
            if (!Number.isFinite(numericScore)) {
                res.status(400).json({ success: false, message: 'قيمة الدرجة غير صالحة' });
                return;
            }
            if (numericScore < 0) {
                res.status(400).json({ success: false, message: 'لا يمكن أن تكون الدرجة سالبة' });
                return;
            }
            if (numericScore > Number(exam.max_score)) {
                res.status(400).json({ success: false, message: `لا يمكن أن تكون الدرجة أكبر من الدرجة القصوى (${Number(exam.max_score)})` });
                return;
            }
            const grade = await service.setGrade(examId, studentId, numericScore, String(me.id));
            try {
                const notif = req.app.get('notificationService');
                await notif.createAndSendNotification({
                    title: 'تم تحديث درجتك في الامتحان',
                    message: `تم تسجيل/تحديث درجتك (${Number(score)}) لامتحان بتاريخ ${exam.exam_date}`,
                    type: 'grade_update',
                    priority: 'medium',
                    recipientType: 'specific_students',
                    recipientIds: [studentId],
                    data: {
                        subType: 'exam_grade',
                        examId: String(exam.id),
                        courseId: String(exam.course_id),
                        subjectId: String(exam.subject_id),
                        examType: String(exam.exam_type),
                        studentId: String(studentId),
                        score: Number(score),
                    },
                    createdBy: String(me.id),
                });
            }
            catch (notifyErr) {
                console.error('Error sending grade notification:', notifyErr);
            }
            res.status(200).json({ success: true, data: grade });
        }
        catch (error) {
            console.error('Error grade exam:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
}
exports.TeacherExamController = TeacherExamController;
//# sourceMappingURL=exam.controller.js.map