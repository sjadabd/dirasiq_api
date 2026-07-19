import type { Request, Response } from 'express';

import { CourseService } from '../../services/teacher/course.service';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta } from '../../utils/pagination';

export class CourseController {
  // GET /api/teacher/courses/names
  static async listNamesForActiveYear(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const data = await CourseService.listNamesForActiveYear(teacherId);
    res.status(200).json(ok(data, 'تم جلب أسماء الدورات'));
  }

  static async create(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const data = await CourseService.create(teacherId, req.body);
    res.status(201).json(ok(data, 'تم إنشاء الدورة'));
  }

  static async getAll(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const query = req.query as unknown as {
      page?: number;
      limit?: number;
      search?: string;
      study_year?: string;
      grade_id?: string;
      subject_id?: string;
      deleted?: boolean;
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const { items, total } = await CourseService.getAllByTeacher(
      teacherId,
      page,
      limit,
      query.search,
      query.study_year,
      query.grade_id,
      query.subject_id,
      query.deleted
    );
    res
      .status(200)
      .json(paginated(items, buildPaginationMeta(total, page, limit), 'تمت العملية بنجاح'));
  }

  static async getById(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const data = await CourseService.getById(id, teacherId);
    res.status(200).json(ok(data, 'تم جلب الدورة'));
  }

  static async update(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const data = await CourseService.update(id, teacherId, req.body);
    res.status(200).json(ok(data, 'تم تحديث الدورة'));
  }

  static async setRegistration(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const registrationOpen = req.body.registration_open as boolean;
    const data = await CourseService.setRegistrationOpen(
      id,
      teacherId,
      registrationOpen
    );
    res
      .status(200)
      .json(
        ok(
          data,
          registrationOpen
            ? 'تم فتح باب التسجيل'
            : 'تم غلق باب التسجيل'
        )
      );
  }

  static async delete(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    await CourseService.delete(id, teacherId);
    res.status(200).json(ok(null, 'تم حذف الدورة'));
  }

  static async getDeletedNotExpired(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const query = req.query as { page?: number; limit?: number };
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const { items, total } = await CourseService.getDeletedNotExpired(teacherId, page, limit);
    res
      .status(200)
      .json(
        paginated(
          items,
          buildPaginationMeta(total, page, limit),
          'تم جلب الدورات المحذوفة غير المنتهية الصلاحية'
        )
      );
  }

  static async restore(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const data = await CourseService.restore(id, teacherId);
    res.status(200).json(ok(data, 'تم استرجاع الدورة'));
  }
}
