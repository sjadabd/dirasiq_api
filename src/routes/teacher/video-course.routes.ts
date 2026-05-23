// /api/teacher/video-courses — teacher-authenticated. Phase 10.1.A.
// auth + role applied at the parent router (routes/teacher/index.ts).
//
// Read-only in 10.1.A. Create/update/delete + Bunny upload flow ship in
// 10.1.B and will be appended to this file then.

import { Router } from 'express';

import { TeacherVideoCourseController } from '../../controllers/teacher/video-course.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import {
  videoCourseIdParamSchema,
  videoCourseTeacherListQuerySchema,
} from '../../schemas/video-course.schemas';

const router = Router();

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

export default router;
