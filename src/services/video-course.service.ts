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

  // ---- TEACHER writes — Phase 10.1.B --------------------------------------

  /**
   * Create a new (pending_review) course owned by `teacherId`. Visibility
   * defaults to `private` so a freshly-created course is invisible to
   * students until the teacher publishes + the admin approves.
   */
  static async createForTeacher(args: {
    teacherId: string;
    title: string;
    description?: string;
    subject: string;
    teachingStage: string;
    gradeId?: string;
    isFree?: boolean;
    price?: number;
    visibility?: VideoCourseVisibility;
  }): Promise<VideoCourse> {
    return VideoCourseModel.insert({
      teacherId: args.teacherId,
      title: args.title,
      description: args.description ?? null,
      subject: args.subject,
      teachingStage: args.teachingStage,
      gradeId: args.gradeId ?? null,
      isFree: args.isFree ?? true,
      price: args.price ?? 0,
      visibility: args.visibility ?? VideoCourseVisibility.PRIVATE,
    });
  }

  /**
   * Partial update + reset moderation state. Throws 404 if the row doesn't
   * exist OR if it's owned by another teacher (anti-enumeration: same wire
   * shape as "no such id").
   */
  static async updateForTeacher(args: {
    id: string;
    teacherId: string;
    updates: Parameters<typeof VideoCourseModel.updateForTeacher>[0]['updates'];
  }): Promise<VideoCourse> {
    const updated = await VideoCourseModel.updateForTeacher({
      id: args.id,
      teacherId: args.teacherId,
      updates: args.updates,
    });
    if (!updated) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    return updated;
  }

  /** Teacher-side soft delete. 404 on unknown / not-owned. */
  static async deleteForTeacher(args: {
    id: string;
    teacherId: string;
  }): Promise<void> {
    const ok = await VideoCourseModel.softDeleteForTeacher(args);
    if (!ok) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }
  }

  /** Replace the cover image. 404 on unknown / not-owned. */
  static async setCoverImageForTeacher(args: {
    id: string;
    teacherId: string;
    coverImage: string;
  }): Promise<VideoCourse> {
    const updated = await VideoCourseModel.setCoverImage(args);
    if (!updated) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    return updated;
  }

  // ---- LESSON writes (Phase 10.1.B.1.c) -----------------------------------

  /**
   * Create a lesson with a Bunny video placeholder.
   *
   * Pipeline:
   *   1. Verify the parent course is owned by `teacherId` (throws 404 if not).
   *   2. Mint a Bunny videoId via BunnyStreamService.createVideo() — the
   *      title sent to Bunny is for their dashboard only.
   *   3. Insert the lesson row with bunny_status='pending'.
   *   4. Return the lesson + the upload contract the client uses to PUT the
   *      bytes directly to Bunny.
   *
   * If step 2 fails (Bunny down / mis-configured) we throw before any DB
   * write so the teacher can retry without leaving an orphan row.
   *
   * SECURITY NOTE: the upload contract returned here contains the per-
   * library Bunny `AccessKey`. A compromised teacher browser could use it
   * to call other Bunny library APIs (delete / list / rename other videos
   * in the same library). This is the trade-off we accepted in the 10.1.B
   * design questions (Direct PUT > TUS for ship-speed). When the library
   * grows, swap to the TUS upload scheme which uses a per-video scoped
   * `AuthorizationSignature` header instead.
   */
  static async createLessonForTeacher(args: {
    teacherId: string;
    courseId: string;
    title: string;
    description?: string;
    displayOrder?: number;
  }): Promise<{
    lesson: VideoLesson;
    upload: {
      kind: 'bunny-direct-put';
      url: string;
      method: 'PUT';
      headers: Record<string, string>;
      note: string;
    };
  }> {
    await this.getForTeacherOrThrow({ id: args.courseId, teacherId: args.teacherId });

    const cfg = BunnyStreamService.config();
    if (!cfg) {
      throw new ApiError(
        503,
        'تشغيل الفيديو غير مهيأ — اتصل بالدعم',
        ErrorCodes.SERVICE_UNAVAILABLE
      );
    }

    const { videoId } = await BunnyStreamService.createVideo({ title: args.title });

    const lesson = await VideoLessonModel.insert({
      courseId: args.courseId,
      title: args.title,
      description: args.description ?? null,
      displayOrder: args.displayOrder ?? 0,
      bunnyLibraryId: cfg.libraryId,
      bunnyVideoId: videoId,
    });

    return {
      lesson,
      upload: {
        kind: 'bunny-direct-put',
        url: `${cfg.apiBaseUrl}/library/${cfg.libraryId}/videos/${videoId}`,
        method: 'PUT',
        headers: {
          AccessKey: cfg.apiKey,
          'Content-Type': 'application/octet-stream',
        },
        note:
          'Stream the video bytes as the PUT body. Bunny replies 200 on success ' +
          'and the API webhook will move the lesson to processing → ready.',
      },
    };
  }

  static async updateLessonForTeacher(args: {
    teacherId: string;
    courseId: string;
    lessonId: string;
    updates: Parameters<typeof VideoLessonModel.updateForOwner>[0]['updates'];
  }): Promise<VideoLesson> {
    await this.getForTeacherOrThrow({ id: args.courseId, teacherId: args.teacherId });
    const updated = await VideoLessonModel.updateForOwner({
      id: args.lessonId,
      courseId: args.courseId,
      updates: args.updates,
    });
    if (!updated) {
      throw new ApiError(404, 'الدرس غير موجود', ErrorCodes.NOT_FOUND);
    }
    return updated;
  }

  /**
   * Soft-delete the lesson AND delete the Bunny video (best-effort).
   * If Bunny is unreachable we still soft-delete locally — the next garbage
   * collection (future cron) can pick up orphans by querying Bunny vs DB.
   */
  static async deleteLessonForTeacher(args: {
    teacherId: string;
    courseId: string;
    lessonId: string;
  }): Promise<void> {
    await this.getForTeacherOrThrow({ id: args.courseId, teacherId: args.teacherId });
    const lesson = await VideoLessonModel.findById(args.lessonId);
    if (!lesson || lesson.courseId !== args.courseId) {
      throw new ApiError(404, 'الدرس غير موجود', ErrorCodes.NOT_FOUND);
    }

    const ok = await VideoLessonModel.softDelete({
      id: args.lessonId,
      courseId: args.courseId,
    });
    if (!ok) {
      throw new ApiError(404, 'الدرس غير موجود', ErrorCodes.NOT_FOUND);
    }

    if (lesson.bunnyVideoId) {
      // Best-effort — never block the local delete on a Bunny outage.
      BunnyStreamService.deleteVideo(lesson.bunnyVideoId).catch((err: unknown) => {
        logger.warn(
          { err, lessonId: args.lessonId, bunnyVideoId: lesson.bunnyVideoId },
          'deleteLessonForTeacher: Bunny delete failed (will retry via GC)'
        );
      });
    }
  }

  /**
   * Bulk reorder. The lessonIds array's index becomes the new display_order.
   * Lessons not in the array keep their current display_order — clients
   * should send the COMPLETE sequence to avoid gaps.
   */
  static async reorderLessonsForTeacher(args: {
    teacherId: string;
    courseId: string;
    lessonIds: string[];
  }): Promise<{ updated: number }> {
    await this.getForTeacherOrThrow({ id: args.courseId, teacherId: args.teacherId });
    const updated = await VideoLessonModel.reorder({
      courseId: args.courseId,
      lessonIds: args.lessonIds,
    });
    return { updated };
  }

  /**
   * Force-reconcile a lesson against Bunny. Used by the "sync" button on the
   * teacher dashboard when a webhook gets lost. Pulls the authoritative
   * state from Bunny + applies it locally.
   */
  static async syncLessonForTeacher(args: {
    teacherId: string;
    courseId: string;
    lessonId: string;
  }): Promise<VideoLesson> {
    await this.getForTeacherOrThrow({ id: args.courseId, teacherId: args.teacherId });
    const lesson = await VideoLessonModel.findById(args.lessonId);
    if (!lesson || lesson.courseId !== args.courseId) {
      throw new ApiError(404, 'الدرس غير موجود', ErrorCodes.NOT_FOUND);
    }
    if (!lesson.bunnyVideoId) {
      throw new ApiError(
        400,
        'الدرس لا يحمل معرف Bunny',
        ErrorCodes.BUSINESS_RULE
      );
    }

    const details = await BunnyStreamService.getVideo(lesson.bunnyVideoId);
    const updated = await VideoLessonModel.applyBunnyState({
      bunnyVideoId: lesson.bunnyVideoId,
      status: details.status,
      thumbnailUrl: details.thumbnailUrl,
      playbackUrl: details.playbackUrl,
      durationSeconds: details.durationSeconds,
    });
    if (!updated) {
      throw new ApiError(404, 'الدرس غير موجود', ErrorCodes.NOT_FOUND);
    }
    return updated;
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
