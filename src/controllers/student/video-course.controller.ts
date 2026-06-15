// Student-side video-course endpoints.
//
// Phase 2 of the National Video Marketplace rebuild: the legacy
// "visibility=public + status=approved" gate that lived in
// VideoCourseService.getForPublicOrThrow is REPLACED by the per-student
// access function (fn_student_can_view_video_course). The controller
// delegates every gate to VideoCourseAccessService so the only place
// access logic lives is the function + the service that wraps it.
//
// Phase 4 adds the purchase initiation endpoint:
//   POST   /:id/purchase               — create Wayl pay-link (or
//                                          short-circuit if the student
//                                          already has access).
//
// Endpoints owned by this file:
//   GET    /                           — marketplace storefront for the
//                                          student (paginated, filterable).
//   GET    /my-library                 — videos this student has access
//                                          to right now.
//   GET    /:id                        — detail (gated by access).
//   GET    /:id/lessons/:lessonId/playback-url — signed HLS URL (gated).
//   POST   /:id/purchase               — start a paid purchase. Phase 4.

import type { Request, Response } from 'express';

import { VideoCourseAccessService } from '../../services/video-course-access.service';
import { VideoCoursePurchaseService } from '../../services/video-course-purchase.service';
import { VideoCourseService } from '../../services/video-course.service';
import { AppSettingService } from '../../services/app-setting.service';
import { VideoCourseModel } from '../../models/video-course.model';
import { ok, paginated } from '../../utils/response.util';
import { parsePagination, buildPaginationMeta } from '../../utils/pagination';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import {
  VideoCourseAccessType,
  VideoCourseStatus,
} from '../../types';
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
  // Detail view. Two modes:
  //
  //   1. Student HAS access → return course + ready lessons. The playback
  //      URL endpoint is the gate for actually playing; this endpoint
  //      just hydrates the detail screen.
  //
  //   2. Student does NOT have access AND the course is marketplace_paid →
  //      return course with `hasAccess: false` + an empty lessons list.
  //      The Flutter detail screen reads `hasAccess` and renders the
  //      purchase CTA in this case. We deliberately let discovery reach
  //      the buy button — without this branch, students would see a
  //      generic load error instead of a clear "اشترِ الدورة" sheet.
  //
  // The 403 stays for the legitimate denial case: no access AND the
  // course is not marketplace_paid (e.g. enrolled_students_free for a
  // student who isn't enrolled in the gating live course).
  //
  // Notes:
  //   - The SQL access function and the playback-url endpoint are
  //     UNCHANGED. Playback access is enforced independently — this
  //     endpoint never mints a manifest URL.
  //   - The course existence + approved check stays in the 404 path
  //     because a missing / pending / rejected course must not be
  //     enumerable through the discovery surface.
  static async detail(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const id = req.params['id'] as string;

    const course = await VideoCourseModel.findById(id);
    if (!course || course.status !== VideoCourseStatus.APPROVED) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }

    const hasAccess = await VideoCourseAccessService.canStudentView(
      studentId,
      id,
    );

    if (hasAccess) {
      const lessons = await VideoCourseAccessService.lessonsForStudent({
        studentId,
        courseId: id,
      });
      res
        .status(200)
        .json(
          ok({ course: { ...course, hasAccess: true }, lessons }, 'تفاصيل الدورة'),
        );
      return;
    }

    if (course.accessType === VideoCourseAccessType.MARKETPLACE_PAID) {
      // Preview metadata for the purchase decision — title, description,
      // duration, thumbnail, displayOrder. STRIP the playback fields so
      // the 4h-valid proxy ticket minted in hydrateLesson never reaches
      // a non-buyer. The Flutter detail screen already blocks playback
      // in `_isPaidUnowned`, so the empty playback URL is harmless to UX.
      const previewLessons = (
        await VideoCourseService.lessonsForOwnerOrAccess(id)
      ).map((lesson) => ({
        ...lesson,
        bunnyPlaybackUrl: null,
        bunnyVideoId: null,
        bunnyLibraryId: null,
      }));
      res
        .status(200)
        .json(
          ok(
            { course: { ...course, hasAccess: false }, lessons: previewLessons },
            'تفاصيل الدورة',
          ),
        );
      return;
    }

    throw new ApiError(
      403,
      'لا تمتلك صلاحية الوصول لهذه الدورة',
      ErrorCodes.FORBIDDEN,
    );
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

  // POST /api/student/video-courses/:id/purchase
  //
  // Phase 4 — initiate a paid purchase. Body MUST be empty (the schema
  // enforces it via .strict()); price + commission come from the
  // server-side course row.
  //
  // Three response shapes are possible:
  //
  //   200 + { alreadyHasAccess: { reason } }
  //     Student already has access (whitelist / prior paid purchase /
  //     enrolled-bypass). NO payment link is created. Client flips the
  //     UI to "open" instead of "buy".
  //
  //   201 + { url, referenceId, purchaseId, amountIqd }
  //     Pending purchase row + Wayl link created in one tx. Client
  //     redirects to `url` to complete payment. Webhook handles the
  //     paid-status flip + wallet credit.
  //
  //   4xx
  //     400 if the course isn't marketplace_paid, the student's grade
  //         doesn't match, or the body is malformed.
  //     404 if the course doesn't exist / is soft-deleted / not approved.
  //     409 if a concurrent click already created a pending purchase.
  //     503 if Wayl env isn't configured.
  static async initiatePurchase(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const id = req.params['id'] as string;

    const features = await AppSettingService.getPaymentFeatures();
    if (!features.videoCoursePurchasesEnabled) {
      throw new ApiError(
        503,
        'سوف تتوفر هذه الميزة قريبًا',
        ErrorCodes.SERVICE_UNAVAILABLE,
        { feature: 'video_course_purchases' }
      );
    }

    const result = await VideoCoursePurchaseService.initiate({
      studentId,
      videoCourseId: id,
    });

    if (result.alreadyHasAccess) {
      res
        .status(200)
        .json(
          ok(
            { alreadyHasAccess: result.alreadyHasAccess },
            'لديك وصول لهذه الدورة بالفعل'
          )
        );
      return;
    }

    res
      .status(201)
      .json(
        ok(
          {
            url: result.url,
            referenceId: result.referenceId,
            purchaseId: result.purchaseId,
            amountIqd: result.amountIqd,
          },
          'تم إنشاء رابط الدفع'
        )
      );
  }
}
