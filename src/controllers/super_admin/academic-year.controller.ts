import type { Request, Response } from 'express';

import { AcademicYearService } from '../../services/super_admin/academic-year.service';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta } from '../../utils/pagination';

export class AcademicYearController {
  static async create(req: Request, res: Response): Promise<void> {
    const { year } = req.body as { year: string };
    const data = await AcademicYearService.create({ year });
    res.status(201).json(ok(data, 'تم إنشاء السنة الأكاديمية'));
  }

  static async getAll(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as {
      page?: number;
      limit?: number;
      search?: string;
      is_active?: boolean;
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const { items, total } = await AcademicYearService.getAll(
      page,
      limit,
      query.search,
      query.is_active
    );
    res
      .status(200)
      .json(paginated(items, buildPaginationMeta(total, page, limit), 'تمت العملية بنجاح'));
  }

  static async getById(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const data = await AcademicYearService.getById(id);
    res.status(200).json(ok(data, 'تم جلب السنة الأكاديمية'));
  }

  static async getActive(_req: Request, res: Response): Promise<void> {
    const data = await AcademicYearService.getActive();
    if (!data) {
      throw new ApiError(404, 'لا توجد سنة أكاديمية نشطة', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(ok(data, 'السنة الأكاديمية المفعلة'));
  }

  static async update(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const { year, is_active } = req.body as { year?: string; is_active?: boolean };
    const patch: Record<string, unknown> = {};
    if (year !== undefined) patch['year'] = year;
    if (is_active !== undefined) patch['is_active'] = is_active;
    const data = await AcademicYearService.update(id, patch as any);
    res.status(200).json(ok(data, 'تم التحديث'));
  }

  static async delete(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    await AcademicYearService.delete(id);
    res.status(200).json(ok(null, 'تم الحذف'));
  }

  static async activate(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const data = await AcademicYearService.activate(id);
    res.status(200).json(ok(data, 'تم التفعيل'));
  }
}
