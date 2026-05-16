import type { Request, Response } from 'express';

import { AcademicYearModel } from '../../models/academic-year.model';
import { ok } from '../../utils/response.util';

export class TeacherAcademicYearController {
  static async list(_req: Request, res: Response): Promise<void> {
    const [{ academicYears }, active] = await Promise.all([
      AcademicYearModel.findAll(1, 1000),
      AcademicYearModel.getActive(),
    ]);
    res.status(200).json(ok({ years: academicYears, active }, 'تم جلب السنوات الدراسية'));
  }
}
