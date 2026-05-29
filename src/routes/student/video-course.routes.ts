// /api/student/video-courses — student-authenticated.
// auth + role applied at the parent router (routes/student/index.ts).
//
// Phase 2 changes:
//   - GET / now serves the marketplace storefront (per-student, with the
//     access function gating eligibility). The legacy
//     videoCoursePublicListQuerySchema is replaced by the richer
//     videoCourseMarketplaceQuerySchema (subject / teacherId / gradeId /
//     priceMax / sort).
//   - NEW: GET /my-library — what the student already has access to.
//   - Detail + playback-url paths unchanged in shape but now gated by
//     the access function under the hood (see controller).
//
// Route ORDER matters: `/my-library` MUST be declared BEFORE `/:id`,
// otherwise express-router's `:id` regex would catch `my-library` as a
// UUID — failing schema validation with a `params.id` error instead of
// reaching the right handler.

import { Router } from 'express';

import { StudentVideoCourseController } from '../../controllers/student/video-course.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import {
  videoCourseIdParamSchema,
  videoCourseLessonIdParamSchema,
  videoCourseMarketplaceQuerySchema,
  videoCoursePurchaseInitiateBodySchema,
  videoCourseStudentLibraryQuerySchema,
} from '../../schemas/video-course.schemas';

const router = Router();

router.get(
  '/',
  validate({ query: videoCourseMarketplaceQuerySchema }),
  asyncHandler(StudentVideoCourseController.list)
);

router.get(
  '/my-library',
  validate({ query: videoCourseStudentLibraryQuerySchema }),
  asyncHandler(StudentVideoCourseController.myLibrary)
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

// Phase 4 — initiate a paid purchase.
router.post(
  '/:id/purchase',
  validate({
    params: videoCourseIdParamSchema,
    body: videoCoursePurchaseInitiateBodySchema,
  }),
  asyncHandler(StudentVideoCourseController.initiatePurchase)
);

export default router;
