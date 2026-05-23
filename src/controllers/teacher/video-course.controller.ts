// Teacher-side video-course endpoints — Phase 10.1.A.
//
// Phase 10.1.A only ships READ endpoints (list / detail / lessons of own
// courses). Teacher create / update / delete + Bunny upload flow ship in
// 10.1.B.

import type { Request, Response } from 'express';

import { VideoCourseService } from '../../services/video-course.service';
import { ok, paginated } from '../../utils/response.util';
import { parsePagination, buildPaginationMeta } from '../../utils/pagination';
import type { VideoCourseStatus } from '../../types';

export class TeacherVideoCourseController {
  // GET /api/teacher/video-courses
  static async list(req: Request, res: Response): Promise<void> {
    const { page, limit, offset } = parsePagination(req.query);
    const query = req.query as { status?: VideoCourseStatus };
    const teacherId = req.user.id;
    const result = await VideoCourseService.listForTeacher({
      teacherId,
      offset,
      limit,
      ...(query.status ? { status: query.status } : {}),
    });
    res
      .status(200)
      .json(
        paginated(
          result.rows,
          buildPaginationMeta(result.total, page, limit),
          'دوراتي المرئية'
        )
      );
  }

  // GET /api/teacher/video-courses/:id
  static async detail(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const course = await VideoCourseService.getForTeacherOrThrow({
      id,
      teacherId: req.user.id,
    });
    res.status(200).json(ok({ course }, 'تفاصيل الدورة'));
  }

  // GET /api/teacher/video-courses/:id/lessons
  static async lessons(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const lessons = await VideoCourseService.lessonsForOwner({
      courseId: id,
      teacherId: req.user.id,
    });
    res.status(200).json(ok({ lessons }, 'دروس الدورة'));
  }
}
