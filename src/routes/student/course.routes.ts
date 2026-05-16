import { Router } from 'express';

import { StudentCourseController } from '../../controllers/student/course.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema } from '../../schemas/common.schemas';
import { suggestedCoursesQuerySchema } from '../../schemas/student.schemas';

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

export default router;
