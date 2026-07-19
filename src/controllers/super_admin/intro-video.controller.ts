// Super-admin intro-video moderation — list + approve / reject.

import type { Request, Response } from 'express';
import { z } from 'zod';

import { buildIntroVideoViewForAdmin } from '../teacher/profile.controller';
import {
  NotificationPriority,
  NotificationType,
  RecipientType,
} from '../../models/notification.model';
import { UserModel } from '../../models/user.model';
import { BunnyStreamService } from '../../services/bunny-stream.service';
import { getNotificationService } from '../../services/services-registry';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { parsePagination, buildPaginationMeta } from '../../utils/pagination';
import { ok, paginated } from '../../utils/response.util';
import { logger } from '../../utils/logger';

export const introVideoAdminListQuerySchema = z.object({
  status: z
    .enum([
      'queue',
      'in_progress',
      'awaiting_review',
      'approved',
      'rejected',
      'processing',
      'uploaded',
      'pending',
      'failed',
      'ready',
    ])
    .optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const introVideoTeacherIdParamSchema = z.object({
  teacherId: z.string().uuid(),
});

export const introVideoRejectBodySchema = z.object({
  notes: z.string().trim().min(1).max(2000).optional(),
  reviewNotes: z.string().trim().min(1).max(2000).optional(),
});

export const introVideoApproveBodySchema = z.object({
  notes: z.string().trim().max(2000).optional(),
  reviewNotes: z.string().trim().max(2000).optional(),
});

async function notifyTeacherReview(args: {
  teacherId: string;
  approved: boolean;
  notes?: string | null;
  actorId: string;
}): Promise<void> {
  const notif = getNotificationService();
  if (!notif) return;
  try {
    await notif.createAndSendNotification({
      title: args.approved
        ? 'تمت الموافقة على الفيديو التعريفي'
        : 'تم رفض الفيديو التعريفي',
      message: args.approved
        ? 'فيديوك التعريفي أصبح ظاهراً للطلاب.'
        : args.notes?.trim()
          ? `سبب الرفض: ${args.notes.trim()}`
          : 'يرجى رفع فيديو جديد وفق الشروط (MP4، ≤60 ثانية، 720–1080p).',
      type: NotificationType.SYSTEM_ANNOUNCEMENT,
      priority: NotificationPriority.HIGH,
      recipientType: RecipientType.SPECIFIC_TEACHERS,
      recipientIds: [args.teacherId],
      data: {
        type: args.approved ? 'intro_video_approved' : 'intro_video_rejected',
        route: '/teacher/profile',
      },
      createdBy: args.actorId,
    });
  } catch (err) {
    logger.warn({ err, teacherId: args.teacherId }, 'intro-video review notify failed');
  }
}

export class SuperAdminIntroVideoController {
  // GET /api/super-admin/intro-videos
  static async list(req: Request, res: Response): Promise<void> {
    const { page, limit, offset } = parsePagination(req.query);
    const query = req.query as { status?: string; search?: string };
    const result = await UserModel.listIntroVideosForAdmin({
      offset,
      limit,
      // Default inbox = encoding + awaiting admin review (not only awaiting_review).
      ...(query.status ? { status: query.status } : { status: 'queue' }),
      ...(query.search ? { search: query.search } : {}),
    });

    // Attach signed playback for triage preview.
    const data = result.rows.map((row) => {
      let manifestUrl: string | null = null;
      if (row.bunnyVideoId && ['awaiting_review', 'approved', 'rejected', 'ready'].includes(row.status)) {
        const signed = BunnyStreamService.buildSignedPlaybackUrl({
          videoId: row.bunnyVideoId,
          ...(req.ip ? { clientIp: req.ip } : {}),
        });
        manifestUrl = signed?.url ?? null;
      }
      return { ...row, manifestUrl };
    });

    res
      .status(200)
      .json(
        paginated(
          data,
          buildPaginationMeta(result.total, page, limit),
          'قائمة الفيديوهات التعريفية'
        )
      );
  }

  // GET /api/super-admin/intro-videos/:teacherId
  static async detail(req: Request, res: Response): Promise<void> {
    const { teacherId } = req.params as { teacherId: string };
    const teacher = await UserModel.findById(teacherId);
    if (!teacher || teacher.userType !== 'teacher') {
      throw new ApiError(404, 'المعلم غير موجود', ErrorCodes.NOT_FOUND);
    }
    const view = buildIntroVideoViewForAdmin(teacher as any, req.ip);
    res.status(200).json(
      ok(
        {
          teacher: {
            id: teacher.id,
            name: teacher.name,
            email: teacher.email,
            profileImagePath: (teacher as any).profileImagePath,
          },
          introVideo: view,
          reviewedBy: (teacher as any).introVideoReviewedBy ?? null,
          reviewedAt: (teacher as any).introVideoReviewedAt ?? null,
          reviewNotes: (teacher as any).introVideoReviewNotes ?? null,
        },
        'تفاصيل الفيديو التعريفي'
      )
    );
  }

  // POST /api/super-admin/intro-videos/:teacherId/approve
  static async approve(req: Request, res: Response): Promise<void> {
    const { teacherId } = req.params as { teacherId: string };
    const body = req.body as { notes?: string; reviewNotes?: string };
    const notes = body.notes ?? body.reviewNotes ?? null;

    const row = await UserModel.reviewIntroVideo({
      teacherId,
      reviewerId: req.user.id,
      decision: 'approved',
      notes,
    });
    if (!row) {
      throw new ApiError(
        409,
        'لا يمكن الموافقة — تأكد أن الفيديو بانتظار المراجعة',
        ErrorCodes.CONFLICT
      );
    }

    void notifyTeacherReview({
      teacherId,
      approved: true,
      notes,
      actorId: req.user.id,
    });

    res.status(200).json(
      ok(
        {
          teacherId: row.id,
          status: row.intro_video_status,
          reviewedAt: row.intro_video_reviewed_at,
        },
        'تمت الموافقة على الفيديو التعريفي'
      )
    );
  }

  // POST /api/super-admin/intro-videos/:teacherId/reject
  static async reject(req: Request, res: Response): Promise<void> {
    const { teacherId } = req.params as { teacherId: string };
    const body = req.body as { notes?: string; reviewNotes?: string };
    const notes = (body.notes ?? body.reviewNotes ?? '').trim();
    if (!notes) {
      throw new ApiError(400, 'ملاحظة الرفض مطلوبة', ErrorCodes.VALIDATION_ERROR);
    }

    const row = await UserModel.reviewIntroVideo({
      teacherId,
      reviewerId: req.user.id,
      decision: 'rejected',
      notes,
    });
    if (!row) {
      throw new ApiError(
        409,
        'لا يمكن الرفض — تأكد أن الفيديو بانتظار المراجعة',
        ErrorCodes.CONFLICT
      );
    }

    void notifyTeacherReview({
      teacherId,
      approved: false,
      notes,
      actorId: req.user.id,
    });

    res.status(200).json(
      ok(
        {
          teacherId: row.id,
          status: row.intro_video_status,
          reviewNotes: row.intro_video_review_notes,
          reviewedAt: row.intro_video_reviewed_at,
        },
        'تم رفض الفيديو التعريفي'
      )
    );
  }

  /**
   * POST /api/super-admin/intro-videos/:teacherId/sync
   * Force-pull Bunny status so a finished encode becomes reviewable.
   */
  static async sync(req: Request, res: Response): Promise<void> {
    const { teacherId } = req.params as { teacherId: string };
    const teacher = await UserModel.findById(teacherId);
    if (!teacher || teacher.userType !== 'teacher') {
      throw new ApiError(404, 'المعلم غير موجود', ErrorCodes.NOT_FOUND);
    }
    const bunnyVideoId = (teacher as any).introVideoBunnyVideoId as string | undefined;
    if (!bunnyVideoId) {
      throw new ApiError(404, 'لا يوجد فيديو Bunny لهذا الأستاذ', ErrorCodes.NOT_FOUND);
    }

    const details = await BunnyStreamService.getVideo(bunnyVideoId);
    const hit = await UserModel.applyIntroVideoBunnyState({
      bunnyVideoId,
      status: details.status as 'pending' | 'uploaded' | 'processing' | 'ready' | 'failed',
      thumbnailUrl: details.thumbnailUrl,
      playbackUrl: details.playbackUrl,
      durationSeconds: details.durationSeconds,
    });
    if (!hit) {
      throw new ApiError(404, 'تعذر تحديث صف الفيديو', ErrorCodes.NOT_FOUND);
    }

    const refreshed = await UserModel.findById(teacherId);
    const view = buildIntroVideoViewForAdmin(refreshed as any, req.ip);
    res.status(200).json(
      ok(
        {
          teacherId,
          bunnyStatus: details.status,
          durationSeconds: details.durationSeconds,
          introVideo: view,
        },
        'تمت مزامنة الفيديو من Bunny'
      )
    );
  }
}
