// Public, unauthenticated video-course endpoints — Phase 10.1.A.
//
// Only approved + public courses are visible here. The service layer
// enforces the visibility filter; this controller is intentionally thin.

import type { Request, Response } from 'express';

import { VideoCourseService } from '../../services/video-course.service';
import { ok, paginated } from '../../utils/response.util';
import { parsePagination, buildPaginationMeta } from '../../utils/pagination';

export class PublicVideoCourseController {
  // GET /api/public/video-courses
  static async list(req: Request, res: Response): Promise<void> {
    const { page, limit, offset } = parsePagination(req.query);
    const query = req.query as { subject?: string; teachingStage?: string };
    const result = await VideoCourseService.listForPublic({
      offset,
      limit,
      ...(query.subject ? { subject: query.subject } : {}),
      ...(query.teachingStage ? { teachingStage: query.teachingStage } : {}),
    });
    res
      .status(200)
      .json(
        paginated(
          result.rows,
          buildPaginationMeta(result.total, page, limit),
          'الدورات المرئية المتاحة'
        )
      );
  }

  // GET /api/public/video-courses/:id
  static async detail(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const course = await VideoCourseService.getForPublicOrThrow(id);
    const lessons = await VideoCourseService.lessonsForPublic(id);
    res.status(200).json(ok({ course, lessons }, 'تفاصيل الدورة'));
  }
}
