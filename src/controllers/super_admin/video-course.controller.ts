// Super-admin video-course endpoints — Phase 10.1.A.
//
// Moderation surface: list any status / visibility, view detail with
// lessons, approve / hide / reject / soft-delete. The list endpoint also
// powers the dashboard moderation queue.

import type { Request, Response } from 'express';

import { VideoCourseService } from '../../services/video-course.service';
import { ok, paginated, okEmpty } from '../../utils/response.util';
import { parsePagination, buildPaginationMeta } from '../../utils/pagination';
import type {
  VideoCourseStatus,
  VideoCourseVisibility,
} from '../../types';
import type {
  VideoCourseRejectInput,
  VideoCourseHideInput,
  VideoCourseApproveInput,
} from '../../schemas/video-course.schemas';

export class SuperAdminVideoCourseController {
  // GET /api/super-admin/video-courses
  static async list(req: Request, res: Response): Promise<void> {
    const { page, limit, offset } = parsePagination(req.query);
    const query = req.query as {
      status?: VideoCourseStatus;
      visibility?: VideoCourseVisibility;
      subject?: string;
      teachingStage?: string;
      teacherId?: string;
      search?: string;
    };
    const result = await VideoCourseService.listForAdmin({
      offset,
      limit,
      ...(query.status ? { status: query.status } : {}),
      ...(query.visibility ? { visibility: query.visibility } : {}),
      ...(query.subject ? { subject: query.subject } : {}),
      ...(query.teachingStage ? { teachingStage: query.teachingStage } : {}),
      ...(query.teacherId ? { teacherId: query.teacherId } : {}),
      ...(query.search ? { search: query.search } : {}),
    });
    res
      .status(200)
      .json(
        paginated(
          result.rows,
          buildPaginationMeta(result.total, page, limit),
          'قائمة الدورات (إدارة)'
        )
      );
  }

  // GET /api/super-admin/video-courses/:id
  static async detail(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const course = await VideoCourseService.getForAdminOrThrow(id);
    const lessons = await VideoCourseService.lessonsForAdmin(id);
    res.status(200).json(ok({ course, lessons }, 'تفاصيل الدورة'));
  }

  // PATCH /api/super-admin/video-courses/:id/approve
  static async approve(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const body = (req.body ?? {}) as NonNullable<VideoCourseApproveInput>;
    const course = await VideoCourseService.approve({
      id,
      reviewerId: req.user.id,
      reviewNotes: body?.reviewNotes ?? null,
    });
    res.status(200).json(ok({ course }, 'تم الموافقة على الدورة'));
  }

  // PATCH /api/super-admin/video-courses/:id/hide
  static async hide(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const body = (req.body ?? {}) as NonNullable<VideoCourseHideInput>;
    const course = await VideoCourseService.hide({
      id,
      reviewerId: req.user.id,
      reviewNotes: body?.reviewNotes ?? null,
    });
    res.status(200).json(ok({ course }, 'تم إخفاء الدورة'));
  }

  // PATCH /api/super-admin/video-courses/:id/reject
  static async reject(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const body = req.body as VideoCourseRejectInput;
    const course = await VideoCourseService.reject({
      id,
      reviewerId: req.user.id,
      reviewNotes: body.reviewNotes,
    });
    res.status(200).json(ok({ course }, 'تم رفض الدورة'));
  }

  // DELETE /api/super-admin/video-courses/:id
  static async remove(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    await VideoCourseService.softDelete(id);
    res.status(200).json(okEmpty('تم حذف الدورة'));
  }
}
