import { Request, Response } from 'express';
import { StudentService } from '../../services/student/student.service';

export class StudentDashboardController {
  static async getOverview(req: Request, res: Response): Promise<void> {
    try {
      const studentId = (req as any).user.id as string;
      const result = await StudentService.getDashboardOverview(studentId);
      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('Error in StudentDashboardController.getOverview:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }

  static async getWeeklySchedule(req: Request, res: Response): Promise<void> {
    try {
      const studentId = (req as any).user.id as string;
      const result = await StudentService.getWeeklySchedule(studentId);
      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error(
        'Error in StudentDashboardController.getWeeklySchedule:',
        error
      );
      res
        .status(500)
        .json({
          success: false,
          message: 'خطأ داخلي في الخادم',
          errors: ['حدث خطأ في الخادم'],
        });
    }
  }
}
