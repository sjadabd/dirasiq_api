// Student-side video-course endpoints — Phase 10.1.A.
//
// The list + detail are identical to /api/public/* (same visibility rules);
// the unique surface here is the signed-playback-URL endpoint which an
// anonymous caller can NOT hit. Future phases may also add
// enrollment / progress tracking here.

import type { Request, Response } from 'express';

import { VideoCourseService } from '../../services/video-course.service';
import { ok, paginated } from '../../utils/response.util';
import { parsePagination, buildPaginationMeta } from '../../utils/pagination';

export class StudentVideoCourseController {
  // GET /api/student/video-courses
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

  // GET /api/student/video-courses/:id
  static async detail(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const course = await VideoCourseService.getForPublicOrThrow(id);
    const lessons = await VideoCourseService.lessonsForPublic(id);
    res.status(200).json(ok({ course, lessons }, 'تفاصيل الدورة'));
  }

  // GET /api/student/video-courses/:id/lessons/:lessonId/playback-url
  static async signedPlaybackUrl(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const lessonId = req.params['lessonId'] as string;
    const clientIp = req.ip;
    const result = await VideoCourseService.signedPlaybackUrlForPublic({
      courseId: id,
      lessonId,
      ...(clientIp ? { clientIp } : {}),
    });
    res
      .status(200)
      .json(
        ok(
          { url: result.url, expiresAt: result.expiresAt.toISOString() },
          'رابط تشغيل مؤقت'
        )
      );
  }
}
