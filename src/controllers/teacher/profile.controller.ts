// Teacher profile controller — intro-video flow.
//
// Phase 10.1.B.2 migrates the intro video off local VPS HLS onto Bunny
// Stream. The migration is read-additive: rows that already carry a local
// manifest path keep playing from there; new uploads always go to Bunny.
//
// Endpoints:
//   POST /api/teacher/profile/intro-video         (LEGACY — local FFmpeg
//                                                  upload. Kept working
//                                                  until the dashboard
//                                                  swaps to Bunny in
//                                                  10.1.B.4. New code
//                                                  should call the Bunny
//                                                  endpoint instead.)
//   POST /api/teacher/profile/intro-video/bunny   (NEW — mints a Bunny
//                                                  videoId + returns the
//                                                  upload contract the
//                                                  client uses to PUT
//                                                  bytes directly to
//                                                  Bunny.)
//   GET  /api/teacher/profile/intro-video         (read — Bunny-first,
//                                                  legacy fallback)
//   GET  /api/students/teachers/:teacherId/intro-video
//                                                  (public read, same
//                                                  precedence)

import type { Request, Response } from 'express';
import fs from 'fs';

import { UserModel } from '../../models/user.model';
import { BunnyStreamService, hydrateBunnyUrl, signBunnyAssetUrl } from '../../services/bunny-stream.service';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok } from '../../utils/response.util';
import { VideoService } from '../../utils/video.service';

interface IntroVideoView {
  status: string;
  /**
   * The playback URL the client should use. For Bunny rows this is a signed
   * HLS manifest URL; for legacy rows it's the local relative manifest
   * path. For the "none" state it's null.
   */
  manifestUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  /** 'bunny' when streaming from Bunny, 'local' for legacy rows, 'none' otherwise. */
  source: 'bunny' | 'local' | 'none';
}

/**
 * Map a (possibly partially-populated) user row to the wire-shape clients
 * consume. Bunny takes precedence over the legacy local manifest — a
 * teacher who re-uploads via Bunny gets the Bunny URL immediately and the
 * old local files are no longer referenced (a future cleanup cron can GC
 * the disk bytes).
 */
function buildIntroVideoView(u: {
  introVideoStatus?: string;
  introVideoManifestPath?: string;
  introVideoThumbnailPath?: string;
  introVideoDurationSeconds?: number;
  introVideoBunnyVideoId?: string;
  introVideoBunnyThumbnailUrl?: string;
}, clientIp?: string): IntroVideoView {
  const status = u.introVideoStatus || 'none';

  if (u.introVideoBunnyVideoId) {
    // Signed URL is only meaningful when Bunny has finished processing.
    let manifestUrl: string | null = null;
    if (status === 'ready') {
      const signed = BunnyStreamService.buildSignedPlaybackUrl({
        videoId: u.introVideoBunnyVideoId,
        ...(clientIp ? { clientIp } : {}),
      });
      manifestUrl = signed?.url ?? null;
    }
    const cfg = BunnyStreamService.config();
    const thumb = hydrateBunnyUrl(u.introVideoBunnyThumbnailUrl ?? null, cfg);
    return {
      status,
      manifestUrl,
      thumbnailUrl: cfg?.signAssets ? signBunnyAssetUrl(thumb, cfg) : thumb,
      durationSeconds: u.introVideoDurationSeconds ?? null,
      source: 'bunny',
    };
  }

  // Legacy local-HLS fallback.
  if (u.introVideoManifestPath) {
    return {
      status,
      manifestUrl: u.introVideoManifestPath,
      thumbnailUrl: u.introVideoThumbnailPath ?? null,
      durationSeconds: u.introVideoDurationSeconds ?? null,
      source: 'local',
    };
  }

  return {
    status: 'none',
    manifestUrl: null,
    thumbnailUrl: null,
    durationSeconds: u.introVideoDurationSeconds ?? null,
    source: 'none',
  };
}

export class TeacherProfileController {
  // POST /api/teacher/profile/intro-video — LEGACY local FFmpeg upload.
  // Kept working for backward compat until the dashboard cuts over in
  // 10.1.B.4. New clients should call the /bunny endpoint below.
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

    await UserModel.update(user.id, { intro_video_status: 'processing' } as any);

    const tempPath = file.path;
    try {
      const result = await VideoService.transcodeToHLS(tempPath, user.id);

      const updated = await UserModel.update(user.id, {
        intro_video_status: 'ready',
        intro_video_manifest_path: result.manifestRelativePath,
        intro_video_storage_dir: result.storageDirRelative,
        intro_video_thumbnail_path: result.thumbnailRelativePath,
        intro_video_duration_seconds: result.durationSeconds,
      } as any);

      res.status(200).json(
        ok(
          {
            manifestUrl: result.manifestRelativePath,
            thumbnailUrl: result.thumbnailRelativePath,
            durationSeconds: result.durationSeconds,
            status: 'ready',
            user: updated,
          },
          'تم رفع ومعالجة فيديو المقدمة بنجاح'
        )
      );
    } catch (err) {
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
   * POST /api/teacher/profile/intro-video/bunny — Phase 10.1.B.2.
   *
   * Mints a Bunny videoId for the calling teacher's intro video and
   * returns the upload contract. The client streams the bytes directly
   * to Bunny via the returned PUT URL. The Bunny webhook will then
   * transition intro_video_status to processing → ready.
   *
   * Re-calling this endpoint replaces any in-flight Bunny upload (the
   * old videoId is best-effort deleted from Bunny so we don't pay for
   * abandoned content).
   *
   * Same security trade-off as the lesson upload flow: the upload
   * contract contains the per-library AccessKey. See the doc-comment on
   * VideoCourseService.createLessonForTeacher for the rationale + the
   * planned TUS upgrade.
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

    // Best-effort delete of any previous Bunny intro video so the user's
    // library doesn't accumulate abandoned uploads.
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
              'and the API webhook will move the intro video to processing → ready.',
          },
        },
        'تم إنشاء فيديو المقدمة على Bunny — قم برفع الملف'
      )
    );
  }

  static async getMyIntroVideo(req: Request, res: Response): Promise<void> {
    const user = req.user;
    const me = await UserModel.findById(user.id);
    if (!me) {
      throw new ApiError(404, 'المستخدم غير موجود', ErrorCodes.NOT_FOUND);
    }
    const view = buildIntroVideoView(me as any, req.ip);
    res.status(200).json(ok(view, 'Intro video info'));
  }

  static async getTeacherIntroVideo(req: Request, res: Response): Promise<void> {
    const { teacherId } = req.params as { teacherId: string };
    const teacher = await UserModel.findById(teacherId);
    if (!teacher || teacher.userType !== 'teacher') {
      throw new ApiError(404, 'المعلم غير موجود', ErrorCodes.NOT_FOUND);
    }
    const view = buildIntroVideoView(teacher as any, req.ip);
    res.status(200).json(
      ok({ ...view, teacher: { id: teacher.id, name: teacher.name } }, 'Intro video info')
    );
  }
}
