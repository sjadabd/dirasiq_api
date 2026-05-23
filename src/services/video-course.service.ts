// VideoCourseService — Phase 10.1.A.
//
// Wraps the models with role-aware visibility checks + Bunny reconciliation +
// signed-playback-URL minting. Services throw ApiError directly (Phase 1.C
// pattern) so controllers stay thin.
//
// Phase 10.1.A scope:
//   - readForPublic / readForStudent / readForTeacher / readForAdmin
//   - admin moderation: approve / hide / reject / softDelete
//   - lessonsForCourse + signedPlaybackUrl
//   - applyBunnyWebhook (called by the webhook handler)
//
// Teacher CRUD writes + the Bunny upload path land in 10.1.B.

import {
  VideoCourseModel,
  VideoLessonModel,
} from '../models/video-course.model';
import {
  BunnyStreamService,
  mapBunnyStatusToInternal,
} from './bunny-stream.service';
import {
  VideoCourse,
  VideoCourseStatus,
  VideoCourseVisibility,
  VideoLesson,
  VideoLessonBunnyStatus,
} from '../types';
import { ApiError, ErrorCodes } from '../utils/api-error';
import { logger } from '../utils/logger';

export class VideoCourseService {
  // ---- READ paths ---------------------------------------------------------

  static async listForPublic(args: {
    offset: number;
    limit: number;
    subject?: string;
    teachingStage?: string;
  }): Promise<{ rows: VideoCourse[]; total: number }> {
    return VideoCourseModel.findManyForPublic(args);
  }

  static async listForTeacher(args: {
    teacherId: string;
    offset: number;
    limit: number;
    status?: VideoCourseStatus;
  }): Promise<{ rows: VideoCourse[]; total: number }> {
    return VideoCourseModel.findManyForTeacher(args);
  }

  static async listForAdmin(args: {
    offset: number;
    limit: number;
    status?: VideoCourseStatus;
    visibility?: VideoCourseVisibility;
    subject?: string;
    teachingStage?: string;
    teacherId?: string;
    search?: string;
  }): Promise<{ rows: VideoCourse[]; total: number }> {
    return VideoCourseModel.findManyForAdmin(args);
  }

  /**
   * Fetch one course for the public/student surface. Throws 404 unless the
   * row is approved + public. Anti-enumeration: a not-yet-approved row is
   * indistinguishable from a non-existent one to anonymous callers.
   */
  static async getForPublicOrThrow(id: string): Promise<VideoCourse> {
    const course = await VideoCourseModel.findById(id);
    if (
      !course ||
      course.status !== VideoCourseStatus.APPROVED ||
      course.visibility !== VideoCourseVisibility.PUBLIC
    ) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    return course;
  }

  /**
   * Teacher fetch — must own the course. Throws 404 if not owned, to avoid
   * leaking the existence of another teacher's course.
   */
  static async getForTeacherOrThrow(args: {
    id: string;
    teacherId: string;
  }): Promise<VideoCourse> {
    const course = await VideoCourseModel.findById(args.id);
    if (!course || course.teacherId !== args.teacherId) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    return course;
  }

  /** Admin fetch — unconditional, only filters out soft-deleted rows. */
  static async getForAdminOrThrow(id: string): Promise<VideoCourse> {
    const course = await VideoCourseModel.findById(id);
    if (!course) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    return course;
  }

  // ---- LESSON reads -------------------------------------------------------

  /**
   * Public-side lessons listing. Only lessons attached to an approved+public
   * course AND with bunny_status='ready' are returned to anonymous callers.
   */
  static async lessonsForPublic(courseId: string): Promise<VideoLesson[]> {
    await this.getForPublicOrThrow(courseId);
    const all = await VideoLessonModel.findByCourse(courseId);
    return all.filter((l) => l.bunnyStatus === VideoLessonBunnyStatus.READY);
  }

  /** Teacher / admin see every lesson (including not-yet-ready). */
  static async lessonsForOwner(args: {
    courseId: string;
    teacherId: string;
  }): Promise<VideoLesson[]> {
    await this.getForTeacherOrThrow({ id: args.courseId, teacherId: args.teacherId });
    return VideoLessonModel.findByCourse(args.courseId);
  }

  static async lessonsForAdmin(courseId: string): Promise<VideoLesson[]> {
    await this.getForAdminOrThrow(courseId);
    return VideoLessonModel.findByCourse(courseId);
  }

  // ---- ADMIN moderation ---------------------------------------------------

  static async approve(args: {
    id: string;
    reviewerId: string;
    reviewNotes?: string | null;
  }): Promise<VideoCourse> {
    const updated = await VideoCourseModel.updateStatus({
      id: args.id,
      status: VideoCourseStatus.APPROVED,
      reviewedBy: args.reviewerId,
      reviewNotes: args.reviewNotes ?? null,
    });
    if (!updated) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    return updated;
  }

  static async hide(args: {
    id: string;
    reviewerId: string;
    reviewNotes?: string | null;
  }): Promise<VideoCourse> {
    const updated = await VideoCourseModel.updateStatus({
      id: args.id,
      status: VideoCourseStatus.HIDDEN,
      reviewedBy: args.reviewerId,
      reviewNotes: args.reviewNotes ?? null,
    });
    if (!updated) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    return updated;
  }

  static async reject(args: {
    id: string;
    reviewerId: string;
    reviewNotes: string;
  }): Promise<VideoCourse> {
    const updated = await VideoCourseModel.updateStatus({
      id: args.id,
      status: VideoCourseStatus.REJECTED,
      reviewedBy: args.reviewerId,
      reviewNotes: args.reviewNotes,
    });
    if (!updated) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    return updated;
  }

  /**
   * Soft delete via super-admin. The course row is hidden from every read
   * (the model's `deleted_at IS NULL` filter excludes it). Bunny lessons
   * are NOT removed at the provider here — that requires a teacher-side
   * cleanup or a Phase 10.1.B garbage-collector cron, since deleting from
   * Bunny on every soft-delete would risk losing already-paid-for storage
   * if the admin needs to undelete.
   */
  static async softDelete(id: string): Promise<void> {
    const ok = await VideoCourseModel.softDelete(id);
    if (!ok) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }
  }

  // ---- PLAYBACK -----------------------------------------------------------

  /**
   * Mint a signed playback URL for the given lesson. Caller-side ownership
   * checks decide who can call this:
   *   - student: course is approved + public AND lesson is ready
   *   - teacher (owner): always allowed
   *   - admin:   always allowed
   *
   * Phase 10.1 only ships free courses. The is_free=false branch returns a
   * 402-equivalent so the client UI can show a "coming soon" CTA without
   * a 5xx.
   */
  static async signedPlaybackUrlForPublic(args: {
    courseId: string;
    lessonId: string;
    clientIp?: string;
  }): Promise<{ url: string; expiresAt: Date }> {
    const course = await this.getForPublicOrThrow(args.courseId);
    if (!course.isFree) {
      throw new ApiError(
        402,
        'الدورات المدفوعة قريباً — قيد التطوير',
        ErrorCodes.BUSINESS_RULE
      );
    }
    return this.mintSignedUrl({
      courseId: args.courseId,
      lessonId: args.lessonId,
      ...(args.clientIp ? { clientIp: args.clientIp } : {}),
    });
  }

  private static async mintSignedUrl(args: {
    courseId: string;
    lessonId: string;
    clientIp?: string;
  }): Promise<{ url: string; expiresAt: Date }> {
    const lesson = await VideoLessonModel.findById(args.lessonId);
    if (!lesson || lesson.courseId !== args.courseId) {
      throw new ApiError(404, 'الدرس غير موجود', ErrorCodes.NOT_FOUND);
    }
    if (lesson.bunnyStatus !== VideoLessonBunnyStatus.READY || !lesson.bunnyVideoId) {
      throw new ApiError(
        409,
        'الدرس قيد المعالجة — حاول لاحقاً',
        ErrorCodes.BUSINESS_RULE
      );
    }
    const signed = BunnyStreamService.buildSignedPlaybackUrl({
      videoId: lesson.bunnyVideoId,
      ...(args.clientIp ? { clientIp: args.clientIp } : {}),
    });
    if (!signed) {
      throw new ApiError(
        503,
        'تشغيل الفيديو غير متاح حالياً',
        ErrorCodes.SERVICE_UNAVAILABLE
      );
    }
    return signed;
  }

  // ---- WEBHOOK reconcile --------------------------------------------------

  /**
   * Apply a Bunny webhook payload to the matching lesson row. Called from
   * the webhook controller AFTER signature verification has passed.
   *
   * Returns the post-update lesson; logs (but does not throw) when the
   * VideoGuid doesn't match any lesson — out-of-band Bunny videos shouldn't
   * 500 our webhook endpoint.
   */
  static async applyBunnyWebhook(args: {
    videoGuid: string;
    statusCode: number;
  }): Promise<VideoLesson | null> {
    const internalStatus = mapBunnyStatusToInternal(args.statusCode);
    let thumbnailUrl: string | null = null;
    let playbackUrl: string | null = null;
    let durationSeconds: number | null = null;

    // For READY transitions, fetch Bunny's authoritative detail so we
    // persist the right thumbnail + duration. Other transitions don't
    // need a roundtrip — the status alone is enough.
    if (internalStatus === VideoLessonBunnyStatus.READY) {
      try {
        const details = await BunnyStreamService.getVideo(args.videoGuid);
        thumbnailUrl = details.thumbnailUrl;
        playbackUrl = details.playbackUrl;
        durationSeconds = details.durationSeconds;
      } catch (err) {
        // Bunny detail miss shouldn't fail the webhook — the next
        // scheduled reconcile (or a teacher-triggered sync) will pick
        // it up. Persist the status now, leave the URLs for later.
        logger.warn(
          { err, videoGuid: args.videoGuid },
          'video-course.applyBunnyWebhook: details fetch failed; status-only update'
        );
      }
    }

    const updated = await VideoLessonModel.applyBunnyState({
      bunnyVideoId: args.videoGuid,
      status: internalStatus,
      thumbnailUrl,
      playbackUrl,
      durationSeconds,
    });

    if (!updated) {
      logger.info(
        { videoGuid: args.videoGuid, statusCode: args.statusCode },
        'bunny webhook: no matching lesson row (out-of-band video?)'
      );
    }
    return updated;
  }
}
