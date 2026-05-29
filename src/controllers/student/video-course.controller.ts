// Student-side video-course endpoints.
//
// Phase 2 of the National Video Marketplace rebuild: the legacy
// "visibility=public + status=approved" gate that lived in
// VideoCourseService.getForPublicOrThrow is REPLACED by the per-student
// access function (fn_student_can_view_video_course). The controller
// delegates every gate to VideoCourseAccessService so the only place
// access logic lives is the function + the service that wraps it.
//
// Endpoints owned by this file:
//   GET    /                           — marketplace storefront for the
//                                          student (paginated, filterable).
//   GET    /my-library                 — videos this student has access
//                                          to right now.
//   GET    /:id                        — detail (gated by access).
//   GET    /:id/lessons/:lessonId/playback-url — signed HLS URL (gated).

import type { Request, Response } from 'express';

import { VideoCourseAccessService } from '../../services/video-course-access.service';
import { ok, paginated } from '../../utils/response.util';
import { parsePagination, buildPaginationMeta } from '../../utils/pagination';
import type { VideoCourseMarketplaceQuery } from '../../schemas/video-course.schemas';

export class StudentVideoCourseController {
  // GET /api/student/video-courses
  //
  // Marketplace browse for an authenticated student. Returns videos the
  // student either has access to OR can buy (paid cards with a grade
  // match). Filters: subject / teacherId / gradeId / priceMax / sort.
  static async list(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const { page, limit, offset } = parsePagination(req.query);
    const q = req.query as unknown as VideoCourseMarketplaceQuery;

    const args: Parameters<typeof VideoCourseAccessService.marketplaceForStudent>[0] = {
      studentId,
      offset,
      limit,
    };
    // `optionalString` widens to `{} | string | undefined` under
    // exactOptionalPropertyTypes; narrow back to `string` explicitly so
    // assignment to the args record's `string | undefined` field is sound.
    const subject   = typeof q.subject   === 'string' ? q.subject   : undefined;
    const teacherId = typeof q.teacherId === 'string' ? q.teacherId : undefined;
    const gradeId   = typeof q.gradeId   === 'string' ? q.gradeId   : undefined;
    if (subject)   args.subject   = subject;
    if (teacherId) args.teacherId = teacherId;
    if (gradeId)   args.gradeId   = gradeId;
    if (typeof q.priceMax === 'number') args.priceMax = q.priceMax;
    if (q.sort) args.sort = q.sort;

    const result = await VideoCourseAccessService.marketplaceForStudent(args);

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

  // GET /api/student/video-courses/my-library
  //
  // Videos the student already has access to (paid purchases, whitelist
  // grants, enrolled-students-free with active teacher relationship,
  // public-by-grade with grade match). Pagination only — no filters.
  static async myLibrary(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const { page, limit, offset } = parsePagination(req.query);

    const result = await VideoCourseAccessService.myLibrary({
      studentId,
      offset,
      limit,
    });

    res
      .status(200)
      .json(
        paginated(
          result.rows,
          buildPaginationMeta(result.total, page, limit),
          'مكتبتي المرئية'
        )
      );
  }

  // GET /api/student/video-courses/:id
  //
  // Detail view, gated by the access function. The lessons list is
  // included alongside the course so a single round trip hydrates the
  // detail screen. Lessons not yet processed (bunny_status != 'ready')
  // are filtered out by the service.
  static async detail(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const id = req.params['id'] as string;

    const course = await VideoCourseAccessService.assertCanViewOrThrow(
      studentId,
      id
    );
    const lessons = await VideoCourseAccessService.lessonsForStudent({
      studentId,
      courseId: id,
    });

    res.status(200).json(ok({ course, lessons }, 'تفاصيل الدورة'));
  }

  // GET /api/student/video-courses/:id/lessons/:lessonId/playback-url
  //
  // Mint a short-lived signed HLS URL. Access function gates the call
  // BEFORE the URL is generated so we never surface a playable URL to
  // a student who shouldn't see it. Bunny ready-state is verified
  // downstream in mintSignedUrlForAccess.
  static async signedPlaybackUrl(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const id = req.params['id'] as string;
    const lessonId = req.params['lessonId'] as string;
    const clientIp = req.ip;

    const result = await VideoCourseAccessService.signedPlaybackUrlForStudent({
      studentId,
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
