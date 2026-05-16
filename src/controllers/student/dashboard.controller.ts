import type { Request, Response } from 'express';

import { StudentService } from '../../services/student/student.service';
import { ok } from '../../utils/response.util';

export class StudentDashboardController {
  static async getOverview(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const data = await StudentService.getDashboardOverview(studentId);
    res.status(200).json(ok(data, 'بيانات لوحة التحكم'));
  }

  static async getWeeklySchedule(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const data = await StudentService.getWeeklySchedule(studentId);
    res.status(200).json(ok(data, 'الجدول الأسبوعي'));
  }
}
