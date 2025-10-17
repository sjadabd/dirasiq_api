import { Request, Response } from 'express';
import { ExamModel, ExamType } from '../../models/exam.model';
import { ExamService } from '../../services/exam.service';

export class StudentExamController {
  static getService(): ExamService { return new ExamService(); }

  // GET /api/student/exams
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const page = parseInt(String((req.query as any)['page'] ?? '1'), 10);
      const limit = parseInt(String((req.query as any)['limit'] ?? '20'), 10);
      const type = (req.query as any)['type'] as string | undefined;
      const service = StudentExamController.getService();
      const result = await service.listForStudent(String(me.id), page, limit, type as ExamType | undefined);
      res.status(200).json({ success: true, data: result.data, pagination: { page, limit, total: result.total } });
    } catch (error) {
      console.error('Error list exams:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // GET /api/student/exams/:id
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const id = String(req.params['id']);
      const service = StudentExamController.getService();
      const item = await service.getById(id);
      if (!item) { res.status(404).json({ success: false, message: 'غير موجود' }); return; }
      res.status(200).json({ success: true, data: item });
    } catch (error) {
      console.error('Error get exam:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // GET /api/student/exams/:id/my-grade
  static async myGrade(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const id = String(req.params['id']);
      // Fetch exam details + student's grade
      const pool = (require('../../config/database') as any).default || require('../../config/database');
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
      if ((r.rowCount || 0) === 0) { res.status(404).json({ success: false, message: 'غير موجود' }); return; }
      const row = r.rows[0];
      const data = {
        id: String(row.exam_id),
        // لا يوجد حقل عنوان للامتحان حالياً في الجدول، يمكن إضافته لاحقاً إن لزم
        title: null as string | null,
        exam_date: String(row.exam_date),
        subject_name: row.subject_name || null,
        course_name: row.course_name || null,
        max_score: typeof row.max_score === 'number' ? row.max_score : Number(row.max_score),
        student_score: row.student_score !== undefined && row.student_score !== null ? Number(row.student_score) : null,
        exam_type: String(row.exam_type),
        description: (row.description ?? null) as string | null,
        notes: (row.notes ?? null) as string | null,
      };
      res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('Error get my grade:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // GET /api/student/exams/report?type=daily|monthly
  static async report(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const type = (req.query as any)['type'] as string | undefined;

      // Fetch exams and grades for the student by type
      const svc = StudentExamController.getService();
      const exams = await svc.listForStudent(String(me.id), 1, 1000, type as ExamType | undefined);

      // Map grades
      const out: any[] = [];
      for (const ex of exams.data) {
        const g = await ExamModel.getGrade(ex.id, String(me.id));
        out.push({ exam: ex, grade: g });
      }
      res.status(200).json({ success: true, data: out });
    } catch (error) {
      console.error('Error build report:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }
}
