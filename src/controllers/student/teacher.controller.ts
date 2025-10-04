import { Request, Response } from 'express';
import { validationResult, query, param } from 'express-validator';
import { StudentService } from '@/services/student/student.service';

export class StudentTeacherController {
  static async getSuggestedTeachers(req: Request, res: Response): Promise<void> {
    try {
      // Validate query params
      await Promise.all([
        query('maxDistance').optional().isFloat({ min: 0.1, max: 50 }).withMessage('المسافة القصوى غير صحيحة').run(req),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('الحد الأقصى غير صحيح').run(req),
        query('search').optional().isString().trim().run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
          errors: errors.array().map(e => e.msg)
        });
        return;
      }

      const studentId = (req as any).user.id as string;
      const { maxDistance = '5', page = '1', limit = '10', search } = req.query as Record<string, string>;

      const result = await StudentService.getSuggestedTeachersForStudent(
        studentId,
        search,
        Number(maxDistance),
        Number(page),
        Number(limit)
      );

      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('Error in getSuggestedTeachers controller:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
    }
  }

  static async getTeacherSubjectsAndCourses(req: Request, res: Response): Promise<void> {
    try {
      await Promise.all([
        param('teacherId').isString().notEmpty().withMessage('معرف المعلم مطلوب').run(req),
        query('page').optional().isInt({ min: 1 }).withMessage('رقم الصفحة غير صحيح').run(req),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('الحد الأقصى غير صحيح').run(req),
        query('search').optional().isString().trim().run(req),
        query('gradeId').optional().isString().trim().run(req),
        query('subjectId').optional().isString().trim().run(req),
        query('studyYear').optional().isString().trim().run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
          errors: errors.array().map(e => e.msg)
        });
        return;
      }

      const { teacherId } = req.params as { teacherId: string };
      const { page = '1', limit = '10', search, gradeId, subjectId, studyYear } = req.query as Record<string, string>;

      const result = await StudentService.getTeacherSubjectsAndCoursesForStudent(
        teacherId,
        Number(page),
        Number(limit),
        search,
        gradeId,
        subjectId,
        studyYear
      );

      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('Error in getTeacherSubjectsAndCourses controller:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
    }
  }
}
