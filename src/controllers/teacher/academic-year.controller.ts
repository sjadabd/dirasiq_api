import { Request, Response } from 'express';
import { AcademicYearModel } from '../../models/academic-year.model';

export class TeacherAcademicYearController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      // Fetch all years (reasonable upper bound) and the active year
      const { academicYears } = await AcademicYearModel.findAll(1, 1000);
      const active = await AcademicYearModel.getActive();
      res.status(200).json({ success: true, data: { years: academicYears, active } });
    } catch (error) {
      console.error('Error list academic years (teacher):', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }
}
