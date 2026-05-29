// Phase 2 of the National Video Marketplace.
//
// The single TS surface that gates every student-side read of a video
// course or its lessons. Every Phase 2+ student route that lists,
// details, or plays a video course MUST route through here. The
// underlying decision is delegated to `fn_student_can_view_video_course`
// (SQL — migration 053) which is the single source of truth.
//
// Why a separate service from VideoCourseService:
//   - VideoCourseService.* still exposes anonymous-safe reads via
//     "*ForPublic" methods. Anonymous storefront browsing of approved +
//     public videos is a separate concern from "this specific student
//     can view this specific video".
//   - Keeping the access concern isolated makes the audit surface
//     small: any future change to the access rules touches this file
//     + the DB function, not every controller.

import { ApiError, ErrorCodes } from '../utils/api-error';
import { VideoCourseAccessModel } from '../models/video-course-access.model';
import { VideoCourseModel } from '../models/video-course.model';
import {
  VideoCourseStatus,
  type VideoCourse,
  type VideoLesson,
} from '../types';
import { VideoCourseService } from './video-course.service';

export class VideoCourseAccessService {
  /**
   * The bare predicate. Pure delegation to the DB function.
   * Returns FALSE for any unknown / soft-deleted / not-approved row.
   */
  static async canStudentView(
    studentId: string,
    videoCourseId: string
  ): Promise<boolean> {
    return VideoCourseAccessModel.canView(studentId, videoCourseId);
  }

  /**
   * Asserts access OR throws. Used by the playback-url and detail
   * endpoints where a denial must short-circuit before any expensive
   * downstream call (signed URL minting, lesson fetch, ...).
   *
   * 403 vs 404 — we use 403 ACCESS_DENIED when the video exists but
   * the student doesn't have access, and 404 NOT_FOUND when the video
   * doesn't exist OR is soft-deleted / not approved. The function itself
   * collapses both into FALSE, so we do a separate findById to tell
   * them apart for the error surface.
   */
  static async assertCanViewOrThrow(
    studentId: string,
    videoCourseId: string
  ): Promise<VideoCourse> {
    const course = await VideoCourseModel.findById(videoCourseId);
    if (!course || course.status !== VideoCourseStatus.APPROVED) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    const allowed = await VideoCourseAccessModel.canView(
      studentId,
      videoCourseId
    );
    if (!allowed) {
      throw new ApiError(
        403,
        'لا تمتلك صلاحية الوصول لهذه الدورة',
        ErrorCodes.FORBIDDEN
      );
    }
    return course;
  }

  /**
   * Marketplace storefront for a student. Carries paid cards that the
   * student qualifies to BUY (grade match) so discovery + purchase
   * can happen — they just won't be able to PLAY until they purchase.
   */
  static async marketplaceForStudent(args: {
    studentId: string;
    offset: number;
    limit: number;
    subject?: string;
    teacherId?: string;
    gradeId?: string;
    priceMax?: number;
    sort?: 'newest' | 'popular' | 'trending' | 'price_asc' | 'price_desc';
  }): Promise<{ rows: VideoCourse[]; total: number }> {
    return VideoCourseModel.findManyForStudentMarketplace(args);
  }

  /**
   * "My Library" — every video the student already has access to. By
   * definition this only includes rows for which the access function
   * returns TRUE today, so the playback URL will succeed without a
   * separate access check.
   */
  static async myLibrary(args: {
    studentId: string;
    offset: number;
    limit: number;
  }): Promise<{ rows: VideoCourse[]; total: number }> {
    return VideoCourseModel.findManyForStudentLibrary(args);
  }

  /**
   * Course Hub videos section — the video courses pinned to a given
   * live course that the student can view. The Hub is built for the
   * student already enrolled in the live course (otherwise they wouldn't
   * be looking at the Hub), so the access function will mostly return
   * TRUE for `enrolled_students_free` videos here. For
   * `marketplace_paid` videos pinned to the course, the student sees
   * only ones they already own / are whitelisted on / qualify via the
   * `free_for_enrolled_students` flag.
   */
  static async videosForCourseHub(args: {
    studentId: string;
    courseId: string;
    offset: number;
    limit: number;
  }): Promise<{ rows: VideoCourse[]; total: number }> {
    return VideoCourseModel.findManyForCourseHub(args);
  }

  /**
   * Student-side lessons fetch. Same shape as
   * VideoCourseService.lessonsForPublic, but the gate is the access
   * function, not visibility=public. Lessons not yet processed are
   * still filtered out so the client only sees ready content.
   */
  static async lessonsForStudent(args: {
    studentId: string;
    courseId: string;
  }): Promise<VideoLesson[]> {
    await this.assertCanViewOrThrow(args.studentId, args.courseId);
    return VideoCourseService.lessonsForOwnerOrAccess(args.courseId);
  }

  /**
   * Mint a signed playback URL for a lesson. The access function gate
   * is applied at this layer; the underlying VideoCourseService.mintSignedUrl
   * call still verifies the lesson is in `ready` state.
   */
  static async signedPlaybackUrlForStudent(args: {
    studentId: string;
    courseId: string;
    lessonId: string;
    clientIp?: string;
  }): Promise<{ url: string; expiresAt: Date }> {
    await this.assertCanViewOrThrow(args.studentId, args.courseId);
    return VideoCourseService.mintSignedUrlForAccess({
      courseId: args.courseId,
      lessonId: args.lessonId,
      ...(args.clientIp ? { clientIp: args.clientIp } : {}),
    });
  }
}
