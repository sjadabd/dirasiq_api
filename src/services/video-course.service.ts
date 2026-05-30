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

import pool from '../config/database';
import {
  VideoCourseModel,
  VideoLessonModel,
} from '../models/video-course.model';
import { VideoCourseGradeTargetModel } from '../models/video-course-grade-target.model';
import { VideoCourseTargetCourseModel } from '../models/video-course-target-course.model';
import { VideoCourseFreeStudentModel } from '../models/video-course-free-student.model';
import { UserModel } from '../models/user.model';
import {
  BunnyStreamService,
  hydrateBunnyUrl,
  mapBunnyStatusToInternal,
  signBunnyAssetUrl,
} from './bunny-stream.service';
import { VideoCourseValidationService } from './video-course-validation.service';
import { PlaybackTicketService } from './playback-ticket.service';
import {
  VideoCourse,
  VideoCourseAccessType,
  VideoCourseStatus,
  VideoCourseVisibility,
  VideoLesson,
  VideoLessonBunnyStatus,
} from '../types';
import { ApiError, ErrorCodes } from '../utils/api-error';
import { logger } from '../utils/logger';
import { getNotificationService } from './services-registry';
import { VideoCourseEvents } from './video-course-events.service';

/**
 * Re-stamp the bunny_* URL fields on a lesson with the currently-configured
 * Bunny CDN hostname AND sign them with the Bunny token-auth key. Used on
 * every lesson read path.
 *
 * Why we sign EVERY URL (not just the playback manifest):
 *   - Bunny Stream libraries can enable "Token Authentication" globally —
 *     when on, ALL asset fetches (playlist .m3u8, thumbnail .jpg, individual
 *     .ts segments) require a valid `?token=<>&expires=<>` query string.
 *   - The library currently in use IS configured with token-auth enabled
 *     (verified by curl returning HTTP 403 for an unsigned thumbnail).
 *   - Returning raw URLs to clients produces "black thumbnails + failed
 *     playback" with no obvious client-side error — Bunny just refuses
 *     the request.
 *
 * Defensive behaviour:
 *   - When Bunny is not configured, returns the lesson unchanged.
 *   - When a URL is empty / null, leaves it null.
 *   - When a URL hostname is foreign (not *.b-cdn.net / *.mediadelivery.net),
 *     leaves it untouched (don't generate fake-signed URLs for arbitrary hosts).
 */
function hydrateLesson<T extends {
  id: string;
  courseId: string;
  bunnyVideoId: string | null;
  bunnyStatus: VideoLessonBunnyStatus;
  bunnyThumbnailUrl: string | null;
  bunnyPlaybackUrl: string | null;
}>(lesson: T): T {
  const cfg = BunnyStreamService.config();
  if (!cfg) return lesson;
  // Thumbnail: per-file Bunny signing is fine — thumbnails are single
  // files, not multi-segment HLS, so a per-file token works.
  const thumbHydrated = hydrateBunnyUrl(lesson.bunnyThumbnailUrl, cfg);
  const thumbnail = cfg.signAssets
    ? signBunnyAssetUrl(thumbHydrated, cfg)
    : thumbHydrated;
  // Playback: route through the manifest proxy when the lesson is ready
  // AND the ticket secret is configured. Per-file Bunny signing 403s on
  // HLS child variant manifests (verified during QA-04); the proxy
  // rewrites every child URL with its own per-file token so the player
  // never hits an unsigned child manifest. Falls back to the legacy
  // raw / per-file Bunny URL when:
  //   - PLAYBACK_TICKET_SECRET is unset (operator hasn't rolled the proxy yet)
  //   - lesson is not in `ready` state (no manifest to mint anyway)
  //   - bunnyVideoId is missing (malformed row — leave for debug)
  let playback = hydrateBunnyUrl(lesson.bunnyPlaybackUrl, cfg);
  const canProxyPlayback =
    lesson.bunnyStatus === VideoLessonBunnyStatus.READY &&
    Boolean(lesson.bunnyVideoId) &&
    Boolean(process.env['PLAYBACK_TICKET_SECRET']);
  if (canProxyPlayback && lesson.bunnyVideoId) {
    try {
      const { ticket } = PlaybackTicketService.issue({
        courseId: lesson.courseId,
        lessonId: lesson.id,
        bunnyVideoId: lesson.bunnyVideoId,
        ttlSeconds: cfg.playbackTokenTtlSeconds,
      });
      const base = (process.env['APP_URL']?.trim() || 'https://api.mulhimiq.com')
        .replace(/\/+$/, '');
      playback =
        `${base}/api/student/video-courses/${encodeURIComponent(lesson.courseId)}` +
        `/lessons/${encodeURIComponent(lesson.id)}/manifest.m3u8` +
        `?ticket=${encodeURIComponent(ticket)}`;
    } catch {
      // Ticket issue failed (env misconfig). Fall through — the raw URL
      // is still set; per-file signing applies below if signAssets is on.
    }
  } else if (cfg.signAssets && playback) {
    playback = signBunnyAssetUrl(playback, cfg);
  }
  return {
    ...lesson,
    bunnyThumbnailUrl: thumbnail,
    bunnyPlaybackUrl: playback,
  };
}

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
    return all
      .filter((l) => l.bunnyStatus === VideoLessonBunnyStatus.READY)
      .map(hydrateLesson);
  }

  /** Teacher / admin see every lesson (including not-yet-ready). */
  static async lessonsForOwner(args: {
    courseId: string;
    teacherId: string;
  }): Promise<VideoLesson[]> {
    await this.getForTeacherOrThrow({ id: args.courseId, teacherId: args.teacherId });
    const all = await VideoLessonModel.findByCourse(args.courseId);
    return all.map(hydrateLesson);
  }

  static async lessonsForAdmin(courseId: string): Promise<VideoLesson[]> {
    await this.getForAdminOrThrow(courseId);
    const all = await VideoLessonModel.findByCourse(courseId);
    return all.map(hydrateLesson);
  }

  /**
   * Helper used by VideoCourseAccessService (Phase 2). The caller is
   * responsible for asserting student access BEFORE calling this — the
   * method itself performs no gating (the legacy `lessonsForPublic`
   * gate on visibility=public is not the right gate under the new
   * access model). Filters to ready lessons only.
   */
  static async lessonsForOwnerOrAccess(courseId: string): Promise<VideoLesson[]> {
    const all = await VideoLessonModel.findByCourse(courseId);
    return all
      .filter((l) => l.bunnyStatus === VideoLessonBunnyStatus.READY)
      .map(hydrateLesson);
  }

  // ---- TEACHER writes — Phase 10.1.B --------------------------------------

  /**
   * Create a new (pending_review) course owned by `teacherId`. The legacy
   * `visibility` defaults to 'public' under the new access model (the
   * access function — not the visibility flag — gates who actually sees
   * what). The course still requires super-admin approval before students
   * can see it (status='pending_review' is the starting point).
   *
   * Two paths share this method:
   *
   *   1. NEW path — `accessType` provided.
   *      Strict cross-field validation (already done in Zod). We then
   *      verify ownership of `targetCourseIds` + student-relationship of
   *      `freeStudentIds` BEFORE opening the transaction so a 400 doesn't
   *      leave a dangling video_courses row.
   *
   *   2. LEGACY path — `accessType` NOT provided.
   *      Derive accessType from isFree (default TRUE → public_free_by_grade,
   *      FALSE → marketplace_paid). All pivot lists are skipped. This
   *      lets the existing dashboard form keep working until Phase 5.
   *
   * Both paths run inside a single tx so a failed pivot sync rolls the
   * insert back.
   */
  static async createForTeacher(args: {
    teacherId: string;
    title: string;
    description?: string;
    subject: string;
    teachingStage: string;

    // Phase 1+ canonical fields.
    accessType?: VideoCourseAccessType;
    freeForEnrolledStudents?: boolean;
    priceIqd?: number;
    gradeTargetIds?: string[];
    targetCourseIds?: string[];
    freeStudentIds?: string[];

    // Legacy back-compat.
    gradeId?: string;
    isFree?: boolean;
    price?: number;
    visibility?: VideoCourseVisibility;
  }): Promise<VideoCourse> {
    const usingNewPath = !!args.accessType;

    // Resolve the four "hidden" columns from whichever input shape we got.
    const accessType: VideoCourseAccessType =
      args.accessType ??
      (args.isFree === false
        ? VideoCourseAccessType.MARKETPLACE_PAID
        : VideoCourseAccessType.PUBLIC_FREE_BY_GRADE);

    const freeForEnrolled =
      accessType === VideoCourseAccessType.MARKETPLACE_PAID
        ? !!args.freeForEnrolledStudents
        : false;

    // Price: prefer the new `priceIqd`, fall back to the legacy `price`,
    // fall back to 0. The schema already rejects negative numbers.
    const effectivePrice =
      typeof args.priceIqd === 'number'
        ? args.priceIqd
        : typeof args.price === 'number'
          ? args.price
          : 0;

    // is_free is derived from access_type for new submissions; for legacy
    // we honour what the caller sent.
    const effectiveIsFree =
      args.accessType === undefined
        ? args.isFree ?? true
        : accessType !== VideoCourseAccessType.MARKETPLACE_PAID;

    // Pre-tx ownership / relationship checks (only on the new path).
    if (usingNewPath) {
      await VideoCourseValidationService.validateTargetCoursesOwnership(
        args.teacherId,
        args.targetCourseIds
      );
      await VideoCourseValidationService.validateFreeStudentsRelationship(
        args.teacherId,
        args.freeStudentIds
      );
    }

    const client = await pool.connect();
    let created: VideoCourse;
    try {
      await client.query('BEGIN');

      created = await VideoCourseModel.insert(
        {
          teacherId: args.teacherId,
          title: args.title,
          description: args.description ?? null,
          subject: args.subject,
          teachingStage: args.teachingStage,
          // The new model uses grade_targets[]; we keep the legacy
          // single-id column populated only when the caller used the
          // legacy path so existing readers still see the same value.
          gradeId: usingNewPath ? null : args.gradeId ?? null,
          isFree: effectiveIsFree,
          price: effectivePrice,
          visibility:
            args.visibility ??
            (usingNewPath
              ? VideoCourseVisibility.PUBLIC
              : VideoCourseVisibility.PRIVATE),
          accessType,
          freeForEnrolledStudents: freeForEnrolled,
        },
        client
      );

      if (usingNewPath) {
        if (args.gradeTargetIds) {
          await VideoCourseGradeTargetModel.sync(
            created.id,
            args.gradeTargetIds,
            client
          );
        }
        if (args.targetCourseIds) {
          await VideoCourseTargetCourseModel.sync(
            created.id,
            args.targetCourseIds,
            client
          );
        }
        if (args.freeStudentIds) {
          await VideoCourseFreeStudentModel.sync(
            created.id,
            args.freeStudentIds,
            args.teacherId,
            null,
            client
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    // Fire-and-forget: notify every super-admin (socket + push). Never
    // throws — see VideoCourseEvents contract.
    void VideoCourseEvents.courseCreated(created, getNotificationService());
    return created;
  }

  /**
   * Partial update + reset moderation state. Throws 404 if the row doesn't
   * exist OR if it's owned by another teacher (anti-enumeration: same wire
   * shape as "no such id").
   *
   * Phase 3 additions:
   *
   *   - `accessType` / `freeForEnrolledStudents` are now updatable.
   *   - `priceIqd` updates the same `price` column. Either field is
   *     accepted on the wire; both never appear at the same time
   *     thanks to controller-level mapping (see below).
   *   - The three pivots (`gradeTargetIds`, `targetCourseIds`,
   *     `freeStudentIds`) follow replace-set semantics: passing an empty
   *     array clears the pivot. Omitting the key leaves it untouched.
   *
   * Final-state validation:
   *   When the merged (post-update) row would have an inconsistent
   *   access_type / grade / price combo (e.g. switching to
   *   marketplace_paid without grade_targets), we throw a 400 BEFORE the
   *   write. This is the equivalent of the Zod create-time superRefine,
   *   moved to the service because partial updates lack the full
   *   payload Zod would need to decide.
   */
  static async updateForTeacher(args: {
    id: string;
    teacherId: string;
    updates: Parameters<typeof VideoCourseModel.updateForTeacher>[0]['updates'];
    // Pivot replace-sets — independent from `updates` because the SQL
    // path is different (separate tables).
    gradeTargetIds?: string[];
    targetCourseIds?: string[];
    freeStudentIds?: string[];
  }): Promise<VideoCourse> {
    // Pre-load the current row so we can validate final state against
    // the merged shape.
    const current = await VideoCourseModel.findById(args.id);
    if (!current || current.teacherId !== args.teacherId) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }

    const nextAccessType =
      (args.updates.accessType as VideoCourseAccessType | undefined) ??
      current.accessType;
    const nextFreeForEnrolled =
      args.updates.freeForEnrolledStudents ?? current.freeForEnrolledStudents;
    const nextPrice =
      args.updates.price !== undefined
        ? args.updates.price
        : Number(current.price);

    // freeForEnrolled only makes sense on marketplace_paid.
    if (
      nextFreeForEnrolled === true &&
      nextAccessType !== VideoCourseAccessType.MARKETPLACE_PAID
    ) {
      throw new ApiError(
        400,
        'freeForEnrolledStudents يعمل فقط مع marketplace_paid',
        ErrorCodes.INVALID_REQUEST,
        { field: 'freeForEnrolledStudents' }
      );
    }

    // For final-state grade validation we use the SUBMITTED list when
    // present, else fall back to the existing rows.
    const willSyncGrades = Array.isArray(args.gradeTargetIds);
    const nextGradeCount = willSyncGrades
      ? args.gradeTargetIds!.length
      : (await VideoCourseGradeTargetModel.listForVideoCourse(args.id)).length;

    if (
      (nextAccessType === VideoCourseAccessType.PUBLIC_FREE_BY_GRADE ||
        nextAccessType === VideoCourseAccessType.MARKETPLACE_PAID) &&
      nextGradeCount === 0
    ) {
      throw new ApiError(
        400,
        'يجب أن تحتوي هذه الدورة على مرحلة دراسية واحدة على الأقل',
        ErrorCodes.INVALID_REQUEST,
        { field: 'gradeTargetIds' }
      );
    }

    if (
      nextAccessType === VideoCourseAccessType.MARKETPLACE_PAID &&
      (!Number.isFinite(nextPrice) || nextPrice <= 0)
    ) {
      throw new ApiError(
        400,
        'السعر يجب أن يكون أكبر من 0 للكورسات المدفوعة',
        ErrorCodes.INVALID_REQUEST,
        { field: 'priceIqd' }
      );
    }

    // Pre-tx ownership checks (only when the lists are actually changing).
    if (Array.isArray(args.targetCourseIds)) {
      await VideoCourseValidationService.validateTargetCoursesOwnership(
        args.teacherId,
        args.targetCourseIds
      );
    }
    if (Array.isArray(args.freeStudentIds)) {
      await VideoCourseValidationService.validateFreeStudentsRelationship(
        args.teacherId,
        args.freeStudentIds
      );
    }

    const client = await pool.connect();
    let updated: VideoCourse | null;
    try {
      await client.query('BEGIN');

      updated = await VideoCourseModel.updateForTeacher(
        {
          id: args.id,
          teacherId: args.teacherId,
          updates: args.updates,
        },
        client
      );
      if (!updated) {
        throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
      }

      if (Array.isArray(args.gradeTargetIds)) {
        await VideoCourseGradeTargetModel.sync(
          args.id,
          args.gradeTargetIds,
          client
        );
      }
      if (Array.isArray(args.targetCourseIds)) {
        await VideoCourseTargetCourseModel.sync(
          args.id,
          args.targetCourseIds,
          client
        );
      }
      if (Array.isArray(args.freeStudentIds)) {
        await VideoCourseFreeStudentModel.sync(
          args.id,
          args.freeStudentIds,
          args.teacherId,
          null,
          client
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
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
    void VideoCourseEvents.courseApproved(updated, args.reviewerId, getNotificationService());
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
    // HIDDEN is functionally a rejection from the teacher's perspective —
    // it removes the course from public listings. Route it through the
    // same "rejected" channel so the UI uses the same handling.
    void VideoCourseEvents.courseRejected(updated, args.reviewerId, getNotificationService());
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
    void VideoCourseEvents.courseRejected(updated, args.reviewerId, getNotificationService());
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

  /**
   * Helper used by VideoCourseAccessService (Phase 2). The caller is
   * responsible for asserting student access BEFORE calling this — the
   * method itself performs no access gate. The lesson-state gates
   * (`ready` bunny status + `bunnyVideoId` present) are still applied.
   */
  static async mintSignedUrlForAccess(args: {
    courseId: string;
    lessonId: string;
    clientIp?: string;
  }): Promise<{ url: string; expiresAt: Date }> {
    return this.mintSignedUrl(args);
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
    if (!BunnyStreamService.isConfigured()) {
      throw new ApiError(
        503,
        'تشغيل الفيديو غير متاح حالياً',
        ErrorCodes.SERVICE_UNAVAILABLE
      );
    }
    // QA-04 fix: Bunny Stream signs URLs per-file, so the master playlist
    // token cannot authenticate the child variant manifests (360p/, 480p/, …).
    // Instead of returning a raw Bunny URL we issue an HMAC ticket and point
    // the player at our manifest proxy, which rewrites every child URL to a
    // separately-signed Bunny URL. See VideoCourseProxyController.
    const cfg = BunnyStreamService.config()!;
    const ttlSeconds = cfg.playbackTokenTtlSeconds;
    const { ticket, expiresAt } = PlaybackTicketService.issue({
      courseId: args.courseId,
      lessonId: args.lessonId,
      bunnyVideoId: lesson.bunnyVideoId,
      ttlSeconds,
    });
    const base = (process.env['APP_URL']?.trim() || 'https://api.mulhimiq.com')
      .replace(/\/+$/, '');
    const url =
      `${base}/api/student/video-courses/${encodeURIComponent(args.courseId)}` +
      `/lessons/${encodeURIComponent(args.lessonId)}/manifest.m3u8` +
      `?ticket=${encodeURIComponent(ticket)}`;
    return { url, expiresAt };
  }

  // ---- WEBHOOK reconcile --------------------------------------------------

  /**
   * Apply a Bunny webhook payload to whichever row owns the videoGuid.
   * Called from the webhook controller AFTER signature verification.
   *
   * Two homes a Bunny videoId can land in:
   *   1. video_lessons.bunny_video_id (lessons in a video_course)
   *   2. users.intro_video_bunny_video_id (teacher intro video)
   *
   * The handler tries (1) first because lessons are the more common case;
   * if no match, it tries (2). A miss in both is logged as info — Bunny
   * may have out-of-band videos we don't track.
   */
  static async applyBunnyWebhook(args: {
    videoGuid: string;
    statusCode: number;
  }): Promise<
    | { matched: 'lesson'; lesson: VideoLesson }
    | { matched: 'intro-video'; userId: string }
    | { matched: 'none' }
  > {
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

    // 1. lessons
    const lesson = await VideoLessonModel.applyBunnyState({
      bunnyVideoId: args.videoGuid,
      status: internalStatus,
      thumbnailUrl,
      playbackUrl,
      durationSeconds,
    });
    if (lesson) {
      // Resolve the owning teacher so we can push a per-user socket event.
      // Best-effort: a course-row miss (e.g. soft-deleted course) just
      // skips the notification — the lesson status was already persisted
      // above, and the dashboard's open detail page (if any) will refresh
      // on next manual refresh.
      try {
        const course = await VideoCourseModel.findById(lesson.courseId);
        if (course?.teacherId) {
          void VideoCourseEvents.lessonStatusChanged(
            { lesson, teacherId: course.teacherId },
            getNotificationService(),
          );
        }
      } catch (err) {
        logger.warn(
          { err, lessonId: lesson.id },
          'video-course.applyBunnyWebhook: failed to dispatch lesson event'
        );
      }
      return { matched: 'lesson', lesson };
    }

    // 2. teacher intro video
    const introHit = await UserModel.applyIntroVideoBunnyState({
      bunnyVideoId: args.videoGuid,
      status: internalStatus,
      thumbnailUrl,
      playbackUrl,
      durationSeconds,
    });
    if (introHit) {
      return { matched: 'intro-video', userId: introHit.userId };
    }

    logger.info(
      { videoGuid: args.videoGuid, statusCode: args.statusCode },
      'bunny webhook: no matching row (lesson or intro video) — out-of-band video?'
    );
    return { matched: 'none' };
  }
}
