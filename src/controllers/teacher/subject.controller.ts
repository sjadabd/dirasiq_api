import type { Request, Response } from 'express';

import { SubjectService } from '../../services/teacher/subject.service';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta } from '../../utils/pagination';

export class SubjectController {
  static async create(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const data = await SubjectService.create(teacherId, req.body);
    res.status(201).json(ok(data, 'تم إنشاء المادة'));
  }

  static async getAll(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const query = req.query as unknown as {
      page?: number;
      limit?: number;
      search?: string;
      is_deleted?: boolean;
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const includeDeleted = query.is_deleted ?? null;
    const { items, total } = await SubjectService.getAllByTeacher(
      teacherId,
      page,
      limit,
      query.search,
      includeDeleted
    );
    res
      .status(200)
      .json(paginated(items, buildPaginationMeta(total, page, limit), 'تمت العملية بنجاح'));
  }

  static async getById(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const data = await SubjectService.getById(id, teacherId);
    res.status(200).json(ok(data, 'تم جلب المادة'));
  }

  static async update(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const data = await SubjectService.update(id, teacherId, req.body);
    res.status(200).json(ok(data, 'تم تحديث المادة'));
  }

  static async delete(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    await SubjectService.delete(id, teacherId);
    res.status(200).json(ok(null, 'تم حذف المادة'));
  }

  static async restore(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    await SubjectService.restore(id, teacherId);
    res.status(200).json(ok(null, 'تم استرجاع المادة'));
  }

  static async hardDelete(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    await SubjectService.hardDelete(id, teacherId);
    res.status(200).json(ok(null, 'تم الحذف النهائي'));
  }

  static async getAllSubjects(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const data = await SubjectService.getAllSubjects(teacherId);
    res.status(200).json(ok(data, 'تم جلب المواد'));
  }
}
