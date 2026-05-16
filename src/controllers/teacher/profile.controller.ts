import type { Request, Response } from 'express';
import fs from 'fs';

import { UserModel } from '../../models/user.model';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok } from '../../utils/response.util';
import { VideoService } from '../../utils/video.service';

export class TeacherProfileController {
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

  static async getMyIntroVideo(req: Request, res: Response): Promise<void> {
    const user = req.user;
    const me = await UserModel.findById(user.id);
    if (!me) {
      throw new ApiError(404, 'المستخدم غير موجود', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(
      ok(
        {
          status: (me as any).introVideoStatus || 'none',
          manifestUrl: (me as any).introVideoManifestPath || null,
          thumbnailUrl: (me as any).introVideoThumbnailPath || null,
          durationSeconds: (me as any).introVideoDurationSeconds || null,
        },
        'Intro video info'
      )
    );
  }

  static async getTeacherIntroVideo(req: Request, res: Response): Promise<void> {
    const { teacherId } = req.params as { teacherId: string };
    const teacher = await UserModel.findById(teacherId);
    if (!teacher || teacher.userType !== 'teacher') {
      throw new ApiError(404, 'المعلم غير موجود', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(
      ok(
        {
          status: (teacher as any).introVideoStatus || 'none',
          manifestUrl: (teacher as any).introVideoManifestPath || null,
          thumbnailUrl: (teacher as any).introVideoThumbnailPath || null,
          durationSeconds: (teacher as any).introVideoDurationSeconds || null,
          teacher: { id: teacher.id, name: teacher.name },
        },
        'Intro video info'
      )
    );
  }
}
