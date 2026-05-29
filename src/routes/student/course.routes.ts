import { Router } from 'express';

import { StudentCourseController } from '../../controllers/student/course.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema } from '../../schemas/common.schemas';
import { suggestedCoursesQuerySchema } from '../../schemas/student.schemas';
import { videoCoursesForCourseHubQuerySchema } from '../../schemas/video-course.schemas';

const router = Router();

router.get(
  '/suggested',
  validate({ query: suggestedCoursesQuerySchema }),
  asyncHandler(StudentCourseController.getSuggestedCourses)
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(StudentCourseController.getCourseById)
);

// Phase 2: Course-Hub videos. Pinned video courses + access filter.
router.get(
  '/:id/video-courses',
  validate({
    params: idParamSchema,
    query: videoCoursesForCourseHubQuerySchema,
  }),
  asyncHandler(StudentCourseController.getCourseVideoCourses)
);

export default router;
