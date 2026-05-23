// /api/student/video-courses — student-authenticated. Phase 10.1.A.
// auth + role applied at the parent router (routes/student/index.ts).

import { Router } from 'express';

import { StudentVideoCourseController } from '../../controllers/student/video-course.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import {
  videoCourseIdParamSchema,
  videoCourseLessonIdParamSchema,
  videoCoursePublicListQuerySchema,
} from '../../schemas/video-course.schemas';

const router = Router();

router.get(
  '/',
  validate({ query: videoCoursePublicListQuerySchema }),
  asyncHandler(StudentVideoCourseController.list)
);

router.get(
  '/:id',
  validate({ params: videoCourseIdParamSchema }),
  asyncHandler(StudentVideoCourseController.detail)
);

router.get(
  '/:id/lessons/:lessonId/playback-url',
  validate({ params: videoCourseLessonIdParamSchema }),
  asyncHandler(StudentVideoCourseController.signedPlaybackUrl)
);

export default router;
