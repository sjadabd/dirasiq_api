import { Request, Response } from 'express';
import { query, validationResult } from 'express-validator';
import { StudentUnifiedSearchService } from '@/services/student/search.service';

export class StudentSearchController {
  // GET /api/student/search/unified?q=...&maxDistance=&page=&limit=
  static async unified(req: Request, res: Response): Promise<void> {
    try {
      await Promise.all([
        query('q')
          .optional()
          .isString()
          .isLength({ min: 1 })
          .withMessage('نص البحث غير صالح')
          .run(req),
        query('maxDistance')
          .optional()
          .isFloat({ min: 0.5, max: 50 })
          .withMessage('المسافة القصوى غير صحيحة')
          .run(req),
        query('page').optional().isInt({ min: 1 }).withMessage('رقم الصفحة غير صحيح').run(req),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('الحد غير صحيح').run(req),
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل التحقق من البيانات',
          errors: errors.array().map((e) => e.msg),
        });
        return;
      }

      const studentId = req.user?.id as string;
      const { q, maxDistance, page, limit } = req.query;

      const params: any = {};
      if (typeof q === 'string' && q.trim() !== '') params.q = q;
      if (typeof maxDistance === 'string' && maxDistance !== '') params.maxDistance = Number(maxDistance);
      if (typeof page === 'string' && page !== '') params.page = Number(page);
      if (typeof limit === 'string' && limit !== '') params.limit = Number(limit);

      const result = await StudentUnifiedSearchService.unifiedSearch(studentId, params);

      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('Error in StudentSearchController.unified:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }
}
