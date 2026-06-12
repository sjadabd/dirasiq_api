// Teacher-side video-course endpoints — Phases 10.1.A + 10.1.B.
//
// Phase 10.1.A: read endpoints (list / detail / lessons).
// Phase 10.1.B: create / update / delete + cover image upload + lesson
//                CRUD + Bunny upload URL minting.

import type { Request, Response } from 'express';

import { VideoCourseService } from '../../services/video-course.service';
import { VideoCourseTargetCourseModel } from '../../models/video-course-target-course.model';
import { getStorageBackend } from '../../services/storage';
import { ok, paginated } from '../../utils/response.util';
import { parsePagination, buildPaginationMeta } from '../../utils/pagination';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { detectFileFormat, mimeMatchesDetection } from '../../utils/file-signature';
import crypto from 'crypto';
import type { VideoCourseStatus } from '../../types';
import type {
  VideoCourseCreateInput,
  VideoCourseUpdateInput,
  VideoLessonCreateInput,
  VideoLessonReorderInput,
  VideoLessonUpdateInput,
} from '../../schemas/video-course.schemas';

// Cover image — small static asset; 5 MB cap, JPG/PNG/WEBP only.
const COVER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const COVER_IMAGE_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export class TeacherVideoCourseController {
  // GET /api/teacher/video-courses
  static async list(req: Request, res: Response): Promise<void> {
    const { page, limit, offset } = parsePagination(req.query);
    const query = req.query as { status?: VideoCourseStatus };
    const teacherId = req.user.id;
    const result = await VideoCourseService.listForTeacher({
      teacherId,
      offset,
      limit,
      ...(query.status ? { status: query.status } : {}),
    });
    res
      .status(200)
      .json(
        paginated(
          result.rows,
          buildPaginationMeta(result.total, page, limit),
          'دوراتي المرئية'
        )
      );
  }

  // GET /api/teacher/video-courses/:id
  static async detail(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const course = await VideoCourseService.getForTeacherOrThrow({
      id,
      teacherId: req.user.id,
    });
    // The live (in-person) courses this video course is linked to — lets the
    // edit form prefill the "ربط بكورس حضوري" picker.
    const targetCourses = await VideoCourseTargetCourseModel.listForVideoCourse(id);
    res.status(200).json(ok({ course, targetCourses }, 'تفاصيل الدورة'));
  }

  // GET /api/teacher/video-courses/:id/lessons
  static async lessons(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const lessons = await VideoCourseService.lessonsForOwner({
      courseId: id,
      teacherId: req.user.id,
    });
    res.status(200).json(ok({ lessons }, 'دروس الدورة'));
  }

  // ----- Phase 10.1.B writes -----------------------------------------------

  // POST /api/teacher/video-courses
  //
  // Two-path body shape (controlled by Zod): legacy fields (isFree, price,
  // visibility, gradeId) keep working untouched; new clients use the
  // canonical fields (accessType + freeForEnrolledStudents + priceIqd +
  // gradeTargetIds + targetCourseIds + freeStudentIds). The service layer
  // owns the actual branching.
  static async create(req: Request, res: Response): Promise<void> {
    const body = req.body as VideoCourseCreateInput;
    const course = await VideoCourseService.createForTeacher({
      teacherId: req.user.id,
      title: body.title,
      ...(body.description !== undefined ? { description: body.description } : {}),
      subject: body.subject,
      teachingStage: body.teachingStage,
      // New marketplace fields.
      ...(body.accessType !== undefined ? { accessType: body.accessType as any } : {}),
      ...(body.freeForEnrolledStudents !== undefined
        ? { freeForEnrolledStudents: body.freeForEnrolledStudents }
        : {}),
      ...(body.priceIqd !== undefined ? { priceIqd: body.priceIqd } : {}),
      ...(body.gradeTargetIds !== undefined ? { gradeTargetIds: body.gradeTargetIds } : {}),
      ...(body.targetCourseIds !== undefined ? { targetCourseIds: body.targetCourseIds } : {}),
      ...(body.freeStudentIds !== undefined ? { freeStudentIds: body.freeStudentIds } : {}),
      // Legacy back-compat.
      ...(body.gradeId !== undefined ? { gradeId: body.gradeId } : {}),
      ...(body.isFree !== undefined ? { isFree: body.isFree } : {}),
      ...(body.price !== undefined ? { price: body.price } : {}),
      ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
    });
    res.status(201).json(ok({ course }, 'تم إنشاء الدورة'));
  }

  // PATCH /api/teacher/video-courses/:id
  //
  // The body splits naturally into two groups:
  //   - column-level updates (title, description, accessType, price, ...) —
  //     passed via the `updates` object to the model's UPDATE statement.
  //   - pivot replace-sets (gradeTargetIds, targetCourseIds,
  //     freeStudentIds) — passed as top-level args; the service runs each
  //     sync inside the same tx as the row update.
  //
  // priceIqd is normalised to price here so the model's whitelisted column
  // map sees one canonical name.
  static async update(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const body = req.body as VideoCourseUpdateInput;

    // Strip undefined keys + canonicalise priceIqd → price. `Partial<{a:
    // string; ...}>` under exactOptionalPropertyTypes refuses
    // `{a: undefined}`, hence the explicit dance.
    const updates: Record<string, unknown> = {};
    const passThrough: (keyof VideoCourseUpdateInput)[] = [
      'title',
      'description',
      'subject',
      'teachingStage',
      'gradeId',
      'isFree',
      'price',
      'visibility',
      'accessType',
      'freeForEnrolledStudents',
    ];
    for (const k of passThrough) {
      const v = (body as Record<string, unknown>)[k];
      if (v !== undefined) updates[k] = v;
    }
    if (body.priceIqd !== undefined) {
      updates['price'] = body.priceIqd;
    }

    const course = await VideoCourseService.updateForTeacher({
      id,
      teacherId: req.user.id,
      updates: updates as Parameters<typeof VideoCourseService.updateForTeacher>[0]['updates'],
      ...(body.gradeTargetIds !== undefined ? { gradeTargetIds: body.gradeTargetIds } : {}),
      ...(body.targetCourseIds !== undefined ? { targetCourseIds: body.targetCourseIds } : {}),
      ...(body.freeStudentIds !== undefined ? { freeStudentIds: body.freeStudentIds } : {}),
    });
    res.status(200).json(ok({ course }, 'تم تحديث الدورة (قيد المراجعة)'));
  }

  // DELETE /api/teacher/video-courses/:id
  static async remove(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    await VideoCourseService.deleteForTeacher({ id, teacherId: req.user.id });
    res.status(200).json(ok(null, 'تم حذف الدورة'));
  }

  // POST /api/teacher/video-courses/:id/cover-image
  //
  // Multer is configured at the route file (memoryStorage, single 'file'
  // field, 5MB cap). Controller is responsible for magic-byte validation +
  // safe filename + storage backend write.
  static async uploadCoverImage(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    // Establish ownership before doing any storage work — anti-DoS.
    const existing = await VideoCourseService.getForTeacherOrThrow({
      id,
      teacherId: req.user.id,
    });

    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) {
      throw new ApiError(
        400,
        'يجب إرفاق صورة',
        ErrorCodes.VALIDATION_ERROR,
        { fields: [{ field: 'file', message: 'file is required', code: 'missing_file' }] }
      );
    }
    if (file.size > COVER_IMAGE_MAX_BYTES) {
      throw new ApiError(
        400,
        'حجم الصورة أكبر من المسموح (5 ميجابايت كحد أقصى)',
        ErrorCodes.VALIDATION_ERROR
      );
    }
    if (!COVER_IMAGE_ALLOWED_MIME.has(file.mimetype)) {
      throw new ApiError(
        400,
        'نوع الملف غير مدعوم (JPG / PNG / WEBP فقط)',
        ErrorCodes.VALIDATION_ERROR
      );
    }
    // Magic-byte detection — defence against rename attacks.
    const detected = detectFileFormat(file.buffer);
    if (!detected || !mimeMatchesDetection(file.mimetype, detected.format)) {
      throw new ApiError(
        400,
        'محتوى الملف لا يطابق نوعه المعلن',
        ErrorCodes.VALIDATION_ERROR
      );
    }

    const ext = detected.format === 'jpeg' ? 'jpg' : detected.format;
    // Filename is server-generated → no user input reaches the disk path.
    const safeFilename = `${crypto.randomUUID()}.${ext}`;
    const key = `uploads/video-courses/${existing.id}/${safeFilename}`;

    const storage = getStorageBackend();
    const meta = await storage.put({
      key,
      bytes: file.buffer,
      contentType: detected.mimeType,
      cacheControl: 'public, max-age=31536000, immutable',
    });

    // If an older cover existed under our key prefix, attempt to clean it
    // up. Best-effort — failure here doesn't break the new upload.
    if (existing.coverImage && existing.coverImage.startsWith('/public/uploads/video-courses/')) {
      const oldKey = existing.coverImage.replace(/^\/public\//, '');
      // fire-and-forget; storage.delete handles ENOENT silently.
      storage.delete(oldKey).catch(() => undefined);
    }

    const updated = await VideoCourseService.setCoverImageForTeacher({
      id: existing.id,
      teacherId: req.user.id,
      coverImage: meta.url,
    });

    res.status(201).json(ok({ course: updated, coverImage: meta }, 'تم رفع صورة الغلاف'));
  }

  // ----- Lessons (Phase 10.1.B.1.c) ----------------------------------------

  // POST /api/teacher/video-courses/:id/lessons
  // Mints a Bunny videoId + inserts the lesson + returns the upload contract
  // the client uses to PUT the bytes directly to Bunny.
  static async createLesson(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const body = req.body as VideoLessonCreateInput;
    const result = await VideoCourseService.createLessonForTeacher({
      teacherId: req.user.id,
      courseId: id,
      title: body.title,
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.displayOrder !== undefined ? { displayOrder: body.displayOrder } : {}),
    });
    res.status(201).json(ok(result, 'تم إنشاء الدرس — قم برفع الفيديو إلى Bunny'));
  }

  // PATCH /api/teacher/video-courses/:id/lessons/:lessonId
  static async updateLesson(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const lessonId = req.params['lessonId'] as string;
    const body = req.body as VideoLessonUpdateInput;
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined) updates[k] = v;
    }
    const lesson = await VideoCourseService.updateLessonForTeacher({
      teacherId: req.user.id,
      courseId: id,
      lessonId,
      updates: updates as Parameters<typeof VideoCourseService.updateLessonForTeacher>[0]['updates'],
    });
    res.status(200).json(ok({ lesson }, 'تم تحديث الدرس'));
  }

  // DELETE /api/teacher/video-courses/:id/lessons/:lessonId
  static async removeLesson(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const lessonId = req.params['lessonId'] as string;
    await VideoCourseService.deleteLessonForTeacher({
      teacherId: req.user.id,
      courseId: id,
      lessonId,
    });
    res.status(200).json(ok(null, 'تم حذف الدرس'));
  }

  // POST /api/teacher/video-courses/:id/lessons/reorder
  static async reorderLessons(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const body = req.body as VideoLessonReorderInput;
    const result = await VideoCourseService.reorderLessonsForTeacher({
      teacherId: req.user.id,
      courseId: id,
      lessonIds: body.lessonIds,
    });
    res.status(200).json(ok(result, 'تم إعادة ترتيب الدروس'));
  }

  // POST /api/teacher/video-courses/:id/lessons/:lessonId/sync
  static async syncLesson(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const lessonId = req.params['lessonId'] as string;
    const lesson = await VideoCourseService.syncLessonForTeacher({
      teacherId: req.user.id,
      courseId: id,
      lessonId,
    });
    res.status(200).json(ok({ lesson }, 'تم تحديث حالة الدرس من Bunny'));
  }
}
