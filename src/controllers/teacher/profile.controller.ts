import { Request, Response } from 'express';
import fs from 'fs';
import { UserModel } from '../../models/user.model';
import { VideoService } from '../../utils/video.service';

export class TeacherProfileController {
  static async uploadIntroVideo(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user || user.userType !== 'teacher') {
        res
          .status(403)
          .json({
            success: false,
            message: 'الوصول مرفوض',
            errors: ['مطلوب صلاحيات المعلم'],
          });
        return;
      }

      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file || !file.path) {
        res
          .status(400)
          .json({
            success: false,
            message: 'فشل في التحقق من البيانات',
            errors: ['ملف الفيديو مطلوب (multipart/form-data, field: video)'],
          });
        return;
      }

      // Parse trimming parameters
      const startRaw = (req.body?.['start'] ?? req.query?.['start']) as any;
      const endRaw = (req.body?.['end'] ?? req.query?.['end']) as any;
      const start = startRaw !== undefined && startRaw !== null && startRaw !== '' ? Number(startRaw) : 0;
      const end = endRaw !== undefined && endRaw !== null && endRaw !== '' ? Number(endRaw) : undefined;

      if (!Number.isFinite(start) || start < 0) {
        res.status(400).json({ success: false, message: 'قيمة البدء غير صحيحة', errors: ['start يجب أن يكون رقمًا أكبر أو يساوي 0'] });
        return;
      }
      if (end !== undefined && (!Number.isFinite(end) || (end as number) <= start)) {
        res.status(400).json({ success: false, message: 'قيمة النهاية غير صحيحة', errors: ['end يجب أن يكون رقمًا أكبر من start'] });
        return;
      }

      // Mark as processing
      await UserModel.update(user.id, {
        intro_video_status: 'processing',
      } as any);

      // Use uploaded temp file path from multer
      const tempPath = file.path;
      let cutPath: string | undefined;

      try {
        // If trimming is requested, cut the segment first
        if ((start && start > 0) || (end !== undefined)) {
          cutPath = await VideoService.trimSegment(tempPath, start, end);
        }

        const inputForHls = cutPath || tempPath;
        // Transcode to HLS for the selected segment (or full video)
        const result = await VideoService.transcodeToHLS(inputForHls, user.id);

        // Persist in DB
        const updated = await UserModel.update(user.id, {
          intro_video_status: 'ready' as any,
          intro_video_manifest_path: result.manifestRelativePath,
          intro_video_storage_dir: result.storageDirRelative,
          intro_video_thumbnail_path: result.thumbnailRelativePath,
          intro_video_duration_seconds: result.durationSeconds,
        } as any);

        res.status(200).json({
          success: true,
          message: 'تم رفع ومعالجة فيديو المقدمة بنجاح',
          data: {
            manifestUrl: result.manifestRelativePath,
            thumbnailUrl: result.thumbnailRelativePath,
            durationSeconds: result.durationSeconds,
            status: 'ready',
            user: updated,
          },
        });
      } catch (e: any) {
        await UserModel.update(user.id, {
          intro_video_status: 'failed',
        } as any);
        res
          .status(500)
          .json({
            success: false,
            message: 'فشل في معالجة الفيديو',
            errors: [e?.message || 'ffmpeg error'],
          });
      } finally {
        // cleanup temp
        try {
          fs.unlinkSync(tempPath);
        } catch {}
        if (cutPath) {
          try { fs.unlinkSync(cutPath); } catch {}
        }
      }
    } catch (error) {
      res
        .status(500)
        .json({
          success: false,
          message: 'خطأ داخلي في الخادم',
          errors: ['حدث خطأ في الخادم'],
        });
    }
  }

  static async getMyIntroVideo(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user || user.userType !== 'teacher') {
        res
          .status(403)
          .json({
            success: false,
            message: 'الوصول مرفوض',
            errors: ['مطلوب صلاحيات المعلم'],
          });
        return;
      }
      const me = await UserModel.findById(user.id);
      if (!me) {
        res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        return;
      }
      res.status(200).json({
        success: true,
        message: 'Intro video info',
        data: {
          status: (me as any).introVideoStatus || 'none',
          manifestUrl: (me as any).introVideoManifestPath || null,
          thumbnailUrl: (me as any).introVideoThumbnailPath || null,
          durationSeconds: (me as any).introVideoDurationSeconds || null,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  static async getTeacherIntroVideo(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const { teacherId } = req.params as { teacherId: string };
      const teacher = await UserModel.findById(teacherId);
      if (!teacher || teacher.userType !== 'teacher') {
        res.status(404).json({ success: false, message: 'المعلم غير موجود' });
        return;
      }
      res.status(200).json({
        success: true,
        message: 'Intro video info',
        data: {
          status: (teacher as any).introVideoStatus || 'none',
          manifestUrl: (teacher as any).introVideoManifestPath || null,
          thumbnailUrl: (teacher as any).introVideoThumbnailPath || null,
          durationSeconds: (teacher as any).introVideoDurationSeconds || null,
          teacher: { id: teacher.id, name: teacher.name },
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }
}
