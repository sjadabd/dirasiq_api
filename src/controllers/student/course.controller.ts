import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { StudentService } from '../../services/student/student.service';

export class StudentCourseController {
  // Get suggested courses for student based on grade and location
  static async getSuggestedCourses(req: Request, res: Response): Promise<void> {
    try {
      // Validate request query
      await Promise.all([
        body('maxDistance').optional().isFloat({ min: 0.1, max: 50 }).withMessage('المسافة القصوى غير صحيحة').run(req),
        body('page').optional().isInt({ min: 1 }).withMessage('رقم الصفحة غير صحيح').run(req),
        body('limit').optional().isInt({ min: 1, max: 100 }).withMessage('الحد الأقصى غير صحيح').run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const studentId = (req as any).user.id;
      const { maxDistance = 5, page = 1, limit = 10 } = req.query;

      // Get student's active grades
      const gradesResult = await StudentService.getActiveGrades(studentId);

      if (!gradesResult.success) {
        res.status(404).json(gradesResult);
        return;
      }


      // Validate student location
      const locationResult = await StudentService.validateStudentLocation(studentId);
      if (!locationResult.success) {
        res.status(400).json(locationResult);
        return;
      }

      const studentGrades = gradesResult.data.grades;
      const studentLocation = locationResult.data.location;

      // Get courses based on student's grade and location
      const result = await StudentService.getSuggestedCoursesForStudent(
        studentId,
        studentGrades,
        studentLocation,
        Number(maxDistance),
        Number(page),
        Number(limit)
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in getSuggestedCourses controller:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Get course details by ID
  static async getCourseById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const studentId = (req as any).user.id;

      // Validate course ID
      if (!id) {
        res.status(400).json({
          success: false,
          message: 'معرف الدورة مطلوب',
          errors: ['معرف الدورة مطلوب']
        });
        return;
      }

      const result = await StudentService.getCourseByIdForStudent(id, studentId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error in getCourseById controller:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }
}
