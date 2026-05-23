// /api/public/video-courses — unauthenticated. Phase 10.1.A.

import { Router } from 'express';

import { PublicVideoCourseController } from '../../controllers/public/video-course.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import {
  videoCourseIdParamSchema,
  videoCoursePublicListQuerySchema,
} from '../../schemas/video-course.schemas';

const router = Router();

router.get(
  '/',
  validate({ query: videoCoursePublicListQuerySchema }),
  asyncHandler(PublicVideoCourseController.list)
);

router.get(
  '/:id',
  validate({ params: videoCourseIdParamSchema }),
  asyncHandler(PublicVideoCourseController.detail)
);

export default router;
