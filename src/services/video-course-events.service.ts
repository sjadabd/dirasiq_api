// Video-course event dispatcher — triple-channel notifications.
//
// One funnel per domain event:
//   1) Socket.IO emit  — live update for clients with an open connection
//                        (teacher's detail screen auto-refreshes, super-admin
//                        moderation queue updates without a poll).
//   2) OneSignal push  — OS-level notification banner for clients whose app
//                        is closed / backgrounded.
//   3) Persistent DB row in `notifications` — so the notification appears in
//                        the in-app inbox history. (Skipped for super-admin
//                        broadcasts today because the existing CHECK
//                        constraint doesn't include a 'super_admins'
//                        recipient_type — push + socket cover that case
//                        until the schema is extended.)
//
// All dispatchers are fire-and-forget — they never throw. Any failure is
// logged and the calling business operation succeeds regardless. This keeps
// "creating a course" from breaking just because OneSignal is rate-limited
// or a player_id row is stale.

import { UserType } from '../types';
import {
  NotificationType,
  RecipientType,
} from '../models/notification.model';
import type { VideoCourse, VideoLesson } from '../types';
import type { NotificationService } from './notification.service';
import { RealtimeService } from './realtime.service';
import { logger } from '../utils/logger';

/** Minimal serializable course slice for socket payloads. */
function serializeCourse(c: VideoCourse) {
  return {
    id: c.id,
    teacherId: c.teacherId,
    title: c.title,
    status: c.status,
    visibility: c.visibility,
    coverImage: c.coverImage,
    subject: c.subject,
    teachingStage: c.teachingStage,
    reviewNotes: c.reviewNotes,
  };
}

function serializeLesson(l: VideoLesson) {
  return {
    id: l.id,
    courseId: l.courseId,
    title: l.title,
    displayOrder: l.displayOrder,
    durationSeconds: l.durationSeconds,
    bunnyStatus: l.bunnyStatus,
    bunnyThumbnailUrl: l.bunnyThumbnailUrl,
  };
}

export const VideoCourseEvents = {
  /**
   * A teacher submitted a NEW course for review. Notifies every super-admin
   * so they can act from the moderation queue.
   */
  async courseCreated(course: VideoCourse, notif?: NotificationService | null): Promise<void> {
    try {
      RealtimeService.emitToRole(UserType.SUPER_ADMIN, 'video-course:created', {
        course: serializeCourse(course),
        at: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn({ err }, 'VideoCourseEvents.courseCreated: socket emit failed');
    }

    if (notif) {
      try {
        // OneSignal fan-out to every super-admin's devices. We use the
        // existing `sendToUserTypes` helper (already supports SUPER_ADMIN)
        // — bypasses the DB row write because the notifications CHECK
        // constraint doesn't include a `super_admins` recipient_type today.
        await notif.sendToUserTypes([UserType.SUPER_ADMIN], {
          title: 'دورة جديدة بانتظار المراجعة',
          message: `${course.title}`,
          data: {
            subType: 'video_course_pending_review',
            courseId: course.id,
            route: '/admin/video-courses',
          },
        });
      } catch (err) {
        logger.warn({ err }, 'VideoCourseEvents.courseCreated: push failed');
      }
    }
  },

  /**
   * Admin approved (or restored) a course. Notifies the owning teacher so
   * their dashboard/app flips status without a manual refresh.
   */
  async courseApproved(course: VideoCourse, reviewerId: string, notif?: NotificationService | null): Promise<void> {
    try {
      RealtimeService.emitToUser(course.teacherId, 'video-course:approved', {
        course: serializeCourse(course),
        at: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn({ err }, 'VideoCourseEvents.courseApproved: socket emit failed');
    }

    if (notif) {
      try {
        await notif.createAndSendNotification({
          title: 'تمت الموافقة على دورتك المرئية',
          message: course.title,
          type: NotificationType.COURSE_UPDATE,
          recipientType: RecipientType.SPECIFIC_TEACHERS,
          recipientIds: [course.teacherId],
          data: {
            subType: 'video_course_approved',
            courseId: course.id,
            route: '/teacher/video-courses/:courseId',
          },
          createdBy: reviewerId,
        });
      } catch (err) {
        logger.warn({ err }, 'VideoCourseEvents.courseApproved: push failed');
      }
    }
  },

  /**
   * Admin rejected a course (or moved it to HIDDEN). Notifies the owning
   * teacher with the rejection note attached to the message.
   */
  async courseRejected(course: VideoCourse, reviewerId: string, notif?: NotificationService | null): Promise<void> {
    try {
      RealtimeService.emitToUser(course.teacherId, 'video-course:rejected', {
        course: serializeCourse(course),
        at: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn({ err }, 'VideoCourseEvents.courseRejected: socket emit failed');
    }

    if (notif) {
      try {
        const msg = course.reviewNotes && course.reviewNotes.trim().length > 0
          ? `${course.title} — السبب: ${course.reviewNotes}`
          : course.title;
        await notif.createAndSendNotification({
          title: 'تم رفض دورتك المرئية',
          message: msg,
          type: NotificationType.COURSE_UPDATE,
          recipientType: RecipientType.SPECIFIC_TEACHERS,
          recipientIds: [course.teacherId],
          data: {
            subType: 'video_course_rejected',
            courseId: course.id,
            route: '/teacher/video-courses/:courseId',
          },
          createdBy: reviewerId,
        });
      } catch (err) {
        logger.warn({ err }, 'VideoCourseEvents.courseRejected: push failed');
      }
    }
  },

  /**
   * A lesson's Bunny processing state changed (typically to READY when the
   * video finishes encoding). Notifies the owning teacher so the open
   * detail screen swaps the "processing…" placeholder for the playable
   * thumbnail without manual refresh.
   *
   * `teacherId` must be looked up by the caller (lessons carry only
   * `courseId`).
   */
  async lessonStatusChanged(
    args: { lesson: VideoLesson; teacherId: string; previousStatus?: string | null },
    notif?: NotificationService | null,
  ): Promise<void> {
    try {
      RealtimeService.emitToUser(args.teacherId, 'video-lesson:status_changed', {
        lesson: serializeLesson(args.lesson),
        previousStatus: args.previousStatus ?? null,
        at: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn({ err }, 'VideoCourseEvents.lessonStatusChanged: socket emit failed');
    }

    // Only push when transitioning into a terminal state worth notifying.
    // PROCESSING / UPLOADED don't deserve a banner — they're intermediate.
    const status = args.lesson.bunnyStatus;
    if (notif && (status === 'ready' || status === 'failed')) {
      try {
        const isReady = status === 'ready';
        await notif.createAndSendNotification({
          title: isReady ? 'تم تجهيز فيديو الدرس' : 'فشل معالجة فيديو الدرس',
          message: isReady
            ? `الدرس "${args.lesson.title}" جاهز للعرض الآن.`
            : `الدرس "${args.lesson.title}" — تحقّق ثم أعد الرفع.`,
          type: NotificationType.COURSE_UPDATE,
          recipientType: RecipientType.SPECIFIC_TEACHERS,
          recipientIds: [args.teacherId],
          data: {
            subType: isReady ? 'video_lesson_ready' : 'video_lesson_failed',
            courseId: args.lesson.courseId,
            lessonId: args.lesson.id,
            route: '/teacher/video-courses/:courseId',
          },
          // The webhook isn't a user — use the teacher as the creator so the
          // FK constraint holds. Could become a dedicated SYSTEM user later.
          createdBy: args.teacherId,
        });
      } catch (err) {
        logger.warn({ err }, 'VideoCourseEvents.lessonStatusChanged: push failed');
      }
    }
  },
};
