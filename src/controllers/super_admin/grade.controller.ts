import type { Request, Response } from 'express';

import { GradeService } from '../../services/super_admin/grade.service';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta } from '../../utils/pagination';

export class GradeController {
  static async create(req: Request, res: Response): Promise<void> {
    const data = await GradeService.create(req.body);
    res.status(201).json(ok(data, 'تم إنشاء الصف'));
  }

  static async getAll(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as { page?: number; limit?: number; search?: string };
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const { items, total } = await GradeService.getAll(page, limit, query.search);
    res
      .status(200)
      .json(paginated(items, buildPaginationMeta(total, page, limit), 'تمت العملية بنجاح'));
  }

  static async getAllActive(_req: Request, res: Response): Promise<void> {
    const data = await GradeService.getAllActive();
    res.status(200).json(ok(data, 'الصفوف المفعلة'));
  }

  static async getActive(_req: Request, res: Response): Promise<void> {
    const data = await GradeService.getActive();
    res.status(200).json(ok(data, 'الصفوف المفعلة'));
  }

  static async getById(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const data = await GradeService.getById(id);
    res.status(200).json(ok(data, 'تم جلب الصف'));
  }

  static async update(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const data = await GradeService.update(id, req.body);
    res.status(200).json(ok(data, 'تم التحديث'));
  }

  static async delete(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    await GradeService.delete(id);
    res.status(200).json(ok(null, 'تم الحذف'));
  }

  static async getUserGrades(req: Request, res: Response): Promise<void> {
    const userId = req.user.id as string;
    const userType = req.user.userType as string;
    const studyYear = (req.query as { study_year?: string }).study_year;
    const data = await GradeService.getUserGrades(userId, userType, studyYear);
    res.status(200).json(ok(data, 'صفوف المستخدم'));
  }
}
