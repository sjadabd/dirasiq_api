import { Request, Response } from 'express';
import { StudentEvaluationService } from '../../services/student-evaluation.service';

export class StudentStudentEvaluationController {
  static getService(): StudentEvaluationService { return new StudentEvaluationService(); }

  // GET /api/student/evaluations
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const { from, to } = (req.query as any) || {};
      const page = parseInt(String((req.query as any)['page'] ?? '1'), 10);
      const limit = parseInt(String((req.query as any)['limit'] ?? '20'), 10);
      const svc = StudentStudentEvaluationController.getService();
      const filters: any = { page, limit };
      if (from) filters.from = String(from);
      if (to) filters.to = String(to);
      const result = await svc.listForStudent(String(me.id), filters);
      res.status(200).json({ success: true, data: result.data, pagination: { page, limit, total: result.total } });
    } catch (error) {
      console.error('Error list my evaluations:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // GET /api/student/evaluations/:id
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const id = String(req.params['id']);
      const svc = StudentStudentEvaluationController.getService();
      const item = await svc.getById(id);
      if (!item) { res.status(404).json({ success: false, message: 'غير موجود' }); return; }
      if (String(item.student_id) !== String(me.id)) { res.status(403).json({ success: false, message: 'غير مصرح' }); return; }
      res.status(200).json({ success: true, data: item });
    } catch (error) {
      console.error('Error get my evaluation:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }
}
