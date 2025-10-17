"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentExamController = void 0;
const exam_model_1 = require("../../models/exam.model");
const exam_service_1 = require("../../services/exam.service");
class StudentExamController {
    static getService() { return new exam_service_1.ExamService(); }
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
            const service = StudentExamController.getService();
            const result = await service.listForStudent(String(me.id), page, limit, type);
            res.status(200).json({ success: true, data: result.data, pagination: { page, limit, total: result.total } });
        }
        catch (error) {
            console.error('Error list exams:', error);
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
            const service = StudentExamController.getService();
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
    static async myGrade(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const id = String(req.params['id']);
            const pool = require('../../config/database').default || require('../../config/database');
            const q = `
        SELECT
          e.id::text AS exam_id,
          e.exam_date,
          e.max_score,
          e.exam_type,
          e.description,
          e.notes,
          c.course_name,
          s.name AS subject_name,
          eg.score AS student_score
        FROM exams e
        LEFT JOIN courses c ON c.id = e.course_id
        LEFT JOIN subjects s ON s.id = e.subject_id
        LEFT JOIN exam_grades eg ON eg.exam_id = e.id AND eg.student_id = $2
        WHERE e.id = $1
      `;
            const r = await pool.query(q, [id, String(me.id)]);
            if ((r.rowCount || 0) === 0) {
                res.status(404).json({ success: false, message: 'غير موجود' });
                return;
            }
            const row = r.rows[0];
            const data = {
                id: String(row.exam_id),
                title: null,
                exam_date: String(row.exam_date),
                subject_name: row.subject_name || null,
                course_name: row.course_name || null,
                max_score: typeof row.max_score === 'number' ? row.max_score : Number(row.max_score),
                student_score: row.student_score !== undefined && row.student_score !== null ? Number(row.student_score) : null,
                exam_type: String(row.exam_type),
                description: (row.description ?? null),
                notes: (row.notes ?? null),
            };
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            console.error('Error get my grade:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async report(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const type = req.query['type'];
            const svc = StudentExamController.getService();
            const exams = await svc.listForStudent(String(me.id), 1, 1000, type);
            const out = [];
            for (const ex of exams.data) {
                const g = await exam_model_1.ExamModel.getGrade(ex.id, String(me.id));
                out.push({ exam: ex, grade: g });
            }
            res.status(200).json({ success: true, data: out });
        }
        catch (error) {
            console.error('Error build report:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
}
exports.StudentExamController = StudentExamController;
//# sourceMappingURL=exam.controller.js.map