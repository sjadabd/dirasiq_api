// Teacher profile controller — intro-video flow.
//
// Phase 10.1.B.2 migrates the intro video off local VPS HLS onto Bunny
// Stream. Admin review (awaiting_review → approved | rejected) gates
// student visibility.
//
// Endpoints:
//   POST /api/teacher/profile/intro-video         (LEGACY — local FFmpeg)
//   POST /api/teacher/profile/intro-video/bunny   (mint Bunny upload contract)
//   POST /api/teacher/profile/intro-video/sync    (poll Bunny status)
//   GET  /api/teacher/profile/intro-video         (owner read — signed URL)
//   GET  /api/student/teachers/:teacherId/intro-video
//                                                  (student — playback only if approved)

import type { Request, Response } from 'express';
import fs from 'fs';

import { UserModel } from '../../models/user.model';
import { BunnyStreamService, hydrateBunnyUrl, signBunnyAssetUrl } from '../../services/bunny-stream.service';
import { buildIntroPlaybackUrl } from '../intro-video-proxy.controller';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok } from '../../utils/response.util';
import { VideoService } from '../../utils/video.service';

const INTRO_MAX_DURATION = UserModel.INTRO_VIDEO_MAX_DURATION_SECONDS;

interface IntroVideoView {
  status: string;
  /**
   * The playback URL the client should use. For Bunny rows this is a signed
   * HLS manifest URL; for legacy rows it's the local relative manifest
   * path. Null when the audience is not allowed to play (e.g. student
   * before approval).
   */
  manifestUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  /** 'bunny' when streaming from Bunny, 'local' for legacy rows, 'none' otherwise. */
  source: 'bunny' | 'local' | 'none';
  reviewNotes?: string | null;
}

type IntroAudience = 'owner' | 'admin' | 'student';

/** Statuses that may receive a signed playback URL for owner/admin. */
const PLAYABLE_FOR_OWNER = new Set([
  'ready',
  'awaiting_review',
  'approved',
  'rejected',
]);

/**
 * Map a (possibly partially-populated) user row to the wire-shape clients
 * consume. Bunny takes precedence over the legacy local manifest.
 *
 * Student audience: playback only when status === 'approved'.
 */
function buildIntroVideoView(
  u: {
    id?: string;
    introVideoStatus?: string;
    introVideoManifestPath?: string;
    introVideoThumbnailPath?: string;
    introVideoDurationSeconds?: number;
    introVideoBunnyVideoId?: string;
    introVideoBunnyThumbnailUrl?: string;
    introVideoReviewNotes?: string;
  },
  opts: { clientIp?: string; audience: IntroAudience; teacherId: string }
): IntroVideoView {
  const status = u.introVideoStatus || 'none';
  const audience = opts.audience;

  if (u.introVideoBunnyVideoId) {
    let canPlay = false;
    if (audience === 'student') {
      canPlay = status === 'approved';
    } else {
      canPlay = PLAYABLE_FOR_OWNER.has(status);
    }

    let manifestUrl: string | null = null;
    if (canPlay) {
      // Prefer HLS manifest proxy (child variants signed). Falls back to
      // signed play_720p.mp4 when PLAYBACK_TICKET_SECRET is unset.
      manifestUrl = buildIntroPlaybackUrl({
        teacherId: opts.teacherId,
        bunnyVideoId: u.introVideoBunnyVideoId,
      });
    }

    const cfg = BunnyStreamService.config();
    let thumbnailUrl: string | null = null;
    if (audience !== 'student' || status === 'approved') {
      const thumb = hydrateBunnyUrl(u.introVideoBunnyThumbnailUrl ?? null, cfg);
      thumbnailUrl = cfg?.signAssets ? signBunnyAssetUrl(thumb, cfg) : thumb;
    }

    return {
      status,
      manifestUrl,
      thumbnailUrl,
      durationSeconds: u.introVideoDurationSeconds ?? null,
      source: 'bunny',
      ...(audience === 'owner' || audience === 'admin'
        ? { reviewNotes: u.introVideoReviewNotes ?? null }
        : {}),
    };
  }

  // Legacy local-HLS fallback — still gated for students.
  if (u.introVideoManifestPath) {
    const allow =
      audience === 'student'
        ? status === 'approved' || status === 'ready'
        : true;
    if (!allow) {
      return {
        status,
        manifestUrl: null,
        thumbnailUrl: null,
        durationSeconds: u.introVideoDurationSeconds ?? null,
        source: 'local',
      };
    }
    return {
      status,
      manifestUrl: u.introVideoManifestPath,
      thumbnailUrl: u.introVideoThumbnailPath ?? null,
      durationSeconds: u.introVideoDurationSeconds ?? null,
      source: 'local',
    };
  }

  return {
    status: status === 'none' ? 'none' : status,
    manifestUrl: null,
    thumbnailUrl: null,
    durationSeconds: u.introVideoDurationSeconds ?? null,
    source: 'none',
    ...(audience === 'owner' || audience === 'admin'
      ? { reviewNotes: u.introVideoReviewNotes ?? null }
      : {}),
  };
}

export class TeacherProfileController {
  // POST /api/teacher/profile/intro-video — LEGACY local FFmpeg upload.
  static async uploadIntroVideo(req: Request, res: Response): Promise<void> {
    const user = req.user;
    const file = req.file as Express.Multer.File | undefined;

    if (!file || !file.path) {
      throw new ApiError(
        400,
        'ملف الفيديو مطلوب (multipart/form-data, field: video)',
        ErrorCodes.VALIDATION_ERROR
      );
    }

    if (file.size > 50 * 1024 * 1024) {
      throw new ApiError(
        400,
        'حجم الفيديو يجب ألا يتجاوز 50 ميغابايت',
        ErrorCodes.VALIDATION_ERROR
      );
    }

    await UserModel.update(user.id, { intro_video_status: 'processing' } as any);

    const tempPath = file.path;
    try {
      const result = await VideoService.transcodeToHLS(tempPath, user.id);

      if (result.durationSeconds > INTRO_MAX_DURATION) {
        await UserModel.update(user.id, {
          intro_video_status: 'failed',
          intro_video_review_notes: 'تجاوز المدة القصوى (60 ثانية)',
        } as any);
        throw new ApiError(
          400,
          'مدة الفيديو يجب ألا تتجاوز 60 ثانية',
          ErrorCodes.VALIDATION_ERROR,
          { durationSeconds: result.durationSeconds }
        );
      }

      const updated = await UserModel.update(user.id, {
        intro_video_status: 'awaiting_review',
        intro_video_manifest_path: result.manifestRelativePath,
        intro_video_storage_dir: result.storageDirRelative,
        intro_video_thumbnail_path: result.thumbnailRelativePath,
        intro_video_duration_seconds: result.durationSeconds,
        intro_video_reviewed_by: null,
        intro_video_reviewed_at: null,
        intro_video_review_notes: null,
      } as any);

      res.status(200).json(
        ok(
          {
            manifestUrl: result.manifestRelativePath,
            thumbnailUrl: result.thumbnailRelativePath,
            durationSeconds: result.durationSeconds,
            status: 'awaiting_review',
            user: updated,
          },
          'تم رفع الفيديو وهو بانتظار مراجعة الإدارة'
        )
      );
    } catch (err) {
      if (err instanceof ApiError) throw err;
      await UserModel.update(user.id, { intro_video_status: 'failed' } as any);
      const message = err instanceof Error ? err.message : 'ffmpeg error';
      throw new ApiError(500, 'فشل في معالجة الفيديو', ErrorCodes.INTERNAL_ERROR, {
        cause: message,
      });
    } finally {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        /* temp file cleanup is best-effort */
      }
    }
  }

  /**
   * POST /api/teacher/profile/intro-video/bunny
   * Mints a Bunny videoId + upload contract. Client PUTs bytes to Bunny.
   */
  static async startBunnyIntroVideoUpload(req: Request, res: Response): Promise<void> {
    const user = req.user;

    const cfg = BunnyStreamService.config();
    if (!cfg) {
      throw new ApiError(
        503,
        'خدمة الفيديو غير مهيأة — اتصل بالدعم',
        ErrorCodes.SERVICE_UNAVAILABLE
      );
    }

    const existing = await UserModel.findById(user.id);
    const previousBunnyVideoId = (existing as any)?.introVideoBunnyVideoId as string | undefined;
    if (previousBunnyVideoId) {
      BunnyStreamService.deleteVideo(previousBunnyVideoId).catch(() => undefined);
    }

    const { videoId } = await BunnyStreamService.createVideo({
      title: `Intro video — ${user.name || user.id}`,
    });

    await UserModel.setIntroVideoBunnyIds({
      userId: user.id,
      libraryId: cfg.libraryId,
      videoId,
    });

    res.status(201).json(
      ok(
        {
          bunnyVideoId: videoId,
          bunnyLibraryId: cfg.libraryId,
          status: 'pending',
          limits: {
            maxDurationSeconds: INTRO_MAX_DURATION,
            maxBytes: 50 * 1024 * 1024,
            formats: ['mp4'],
            minHeight: 720,
            maxHeight: 1080,
          },
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
              'and the API webhook will move the intro video to processing → awaiting_review.',
          },
        },
        'تم إنشاء فيديو المقدمة على Bunny — قم برفع الملف'
      )
    );
  }

  /**
   * POST /api/teacher/profile/intro-video/sync
   * Poll Bunny for status (useful when webhook is delayed).
   */
  static async syncIntroVideo(req: Request, res: Response): Promise<void> {
    const user = req.user;
    const me = await UserModel.findById(user.id);
    if (!me) {
      throw new ApiError(404, 'المستخدم غير موجود', ErrorCodes.NOT_FOUND);
    }
    const bunnyVideoId = (me as any).introVideoBunnyVideoId as string | undefined;
    if (!bunnyVideoId) {
      throw new ApiError(404, 'لا يوجد فيديو تعريفي على Bunny', ErrorCodes.NOT_FOUND);
    }

    const details = await BunnyStreamService.getVideo(bunnyVideoId);
    await UserModel.applyIntroVideoBunnyState({
      bunnyVideoId,
      status: details.status as 'pending' | 'uploaded' | 'processing' | 'ready' | 'failed',
      thumbnailUrl: details.thumbnailUrl,
      playbackUrl: details.playbackUrl,
      durationSeconds: details.durationSeconds,
    });

    const refreshed = await UserModel.findById(user.id);
    const view = buildIntroVideoView(refreshed as any, {
      audience: 'owner',
      teacherId: user.id,
      ...(req.ip ? { clientIp: req.ip } : {}),
    });
    res.status(200).json(ok(view, 'تم تحديث حالة الفيديو التعريفي من Bunny'));
  }

  /**
   * POST /api/teacher/profile/intro-video/confirm-upload
   * Called right after the client finishes PUT to Bunny so the row leaves
   * mint-only `pending` even before the first webhook/sync.
   */
  static async confirmIntroVideoUpload(req: Request, res: Response): Promise<void> {
    await UserModel.markIntroVideoUploaded(req.user.id);
    const me = await UserModel.findById(req.user.id);
    const view = buildIntroVideoView(me as any, {
      audience: 'owner',
      teacherId: req.user.id,
      ...(req.ip ? { clientIp: req.ip } : {}),
    });
    res.status(200).json(ok(view, 'تم تأكيد رفع الفيديو'));
  }

  static async getMyIntroVideo(req: Request, res: Response): Promise<void> {
    const user = req.user;
    const me = await UserModel.findById(user.id);
    if (!me) {
      throw new ApiError(404, 'المستخدم غير موجود', ErrorCodes.NOT_FOUND);
    }
    const view = buildIntroVideoView(me as any, {
      audience: 'owner',
      teacherId: user.id,
      ...(req.ip ? { clientIp: req.ip } : {}),
    });
    res.status(200).json(ok(view, 'Intro video info'));
  }

  static async getTeacherIntroVideo(req: Request, res: Response): Promise<void> {
    const { teacherId } = req.params as { teacherId: string };
    const teacher = await UserModel.findById(teacherId);
    if (!teacher || teacher.userType !== 'teacher') {
      throw new ApiError(404, 'المعلم غير موجود', ErrorCodes.NOT_FOUND);
    }
    const view = buildIntroVideoView(teacher as any, {
      audience: 'student',
      teacherId,
      ...(req.ip ? { clientIp: req.ip } : {}),
    });
    res.status(200).json(
      ok({ ...view, teacher: { id: teacher.id, name: teacher.name } }, 'Intro video info')
    );
  }
}

/** Exported for the super-admin controller to reuse the same view builder. */
export function buildIntroVideoViewForAdmin(
  u: Parameters<typeof buildIntroVideoView>[0],
  teacherId: string,
  clientIp?: string
): IntroVideoView {
  return buildIntroVideoView(u, {
    audience: 'admin',
    teacherId,
    ...(clientIp ? { clientIp } : {}),
  });
}
