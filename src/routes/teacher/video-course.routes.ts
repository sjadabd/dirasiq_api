// /api/teacher/video-courses — teacher-authenticated. Phases 10.1.A + B.
// auth + role applied at the parent router (routes/teacher/index.ts).
//
// 10.1.A: read endpoints.
// 10.1.B: create / update / delete + cover-image upload + lesson CRUD
//         + Bunny upload URL minting (lesson endpoints land in B.1.c).

import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';

import { TeacherVideoCourseController } from '../../controllers/teacher/video-course.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import {
  videoCourseCreateSchema,
  videoCourseIdParamSchema,
  videoCourseLessonIdParamSchema,
  videoCourseTeacherListQuerySchema,
  videoCourseUpdateSchema,
  videoLessonCreateSchema,
  videoLessonReorderSchema,
  videoLessonUpdateSchema,
} from '../../schemas/video-course.schemas';

const router = Router();

// ----- Multer for cover image upload --------------------------------------
//
// memoryStorage so the controller can magic-byte the buffer before any
// disk write. 5MB hard cap at the multer layer (controller re-checks for
// belt-and-braces) + 1 file + minimal field budget.

const COVER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const coverImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: COVER_IMAGE_MAX_BYTES,
    files: 1,
    fields: 4,
    parts: 5,
  },
});

// ----- Upload rate limiter — Phase 10.1.B ---------------------------------
//
// 60 uploads / hour / per IP. Generous enough for a teacher iterating on
// cover image / lesson swaps; strict enough that a compromised teacher
// session can't be used to spray storage.
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  skip: () => process.env['NODE_ENV'] === 'test',
  handler: () => {
    throw new ApiError(
      429,
      'تم تجاوز عدد محاولات الرفع المسموح بها. حاول لاحقاً.',
      ErrorCodes.RATE_LIMITED
    );
  },
});

// ----- Reads (10.1.A) -----------------------------------------------------

router.get(
  '/',
  validate({ query: videoCourseTeacherListQuerySchema }),
  asyncHandler(TeacherVideoCourseController.list)
);

router.get(
  '/:id',
  validate({ params: videoCourseIdParamSchema }),
  asyncHandler(TeacherVideoCourseController.detail)
);

router.get(
  '/:id/lessons',
  validate({ params: videoCourseIdParamSchema }),
  asyncHandler(TeacherVideoCourseController.lessons)
);

// ----- Writes (10.1.B) ----------------------------------------------------

router.post(
  '/',
  validate({ body: videoCourseCreateSchema }),
  asyncHandler(TeacherVideoCourseController.create)
);

router.patch(
  '/:id',
  validate({ params: videoCourseIdParamSchema, body: videoCourseUpdateSchema }),
  asyncHandler(TeacherVideoCourseController.update)
);

router.delete(
  '/:id',
  validate({ params: videoCourseIdParamSchema }),
  asyncHandler(TeacherVideoCourseController.remove)
);

router.post(
  '/:id/cover-image',
  uploadLimiter,
  validate({ params: videoCourseIdParamSchema }),
  coverImageUpload.single('file'),
  asyncHandler(TeacherVideoCourseController.uploadCoverImage)
);

// ----- Lessons (10.1.B.1.c) -----------------------------------------------
//
// Reorder is declared BEFORE /:lessonId so Express doesn't try to match
// "reorder" as a lessonId UUID (it would fail validation but the order
// keeps the intent crystal-clear).

router.post(
  '/:id/lessons',
  uploadLimiter,
  validate({ params: videoCourseIdParamSchema, body: videoLessonCreateSchema }),
  asyncHandler(TeacherVideoCourseController.createLesson)
);

router.post(
  '/:id/lessons/reorder',
  validate({ params: videoCourseIdParamSchema, body: videoLessonReorderSchema }),
  asyncHandler(TeacherVideoCourseController.reorderLessons)
);

router.patch(
  '/:id/lessons/:lessonId',
  validate({ params: videoCourseLessonIdParamSchema, body: videoLessonUpdateSchema }),
  asyncHandler(TeacherVideoCourseController.updateLesson)
);

router.delete(
  '/:id/lessons/:lessonId',
  validate({ params: videoCourseLessonIdParamSchema }),
  asyncHandler(TeacherVideoCourseController.removeLesson)
);

router.post(
  '/:id/lessons/:lessonId/sync',
  validate({ params: videoCourseLessonIdParamSchema }),
  asyncHandler(TeacherVideoCourseController.syncLesson)
);

export default router;
