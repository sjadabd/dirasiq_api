import { Router } from 'express';

import { StudentEnrollmentController } from '../../controllers/student/enrollment.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { courseIdParamSchema } from '../../schemas/common.schemas';
import {
  enrollmentListQuerySchema,
  weeklyScheduleQuerySchema,
} from '../../schemas/student.schemas';

const router = Router();

router.get(
  '/',
  validate({ query: enrollmentListQuerySchema }),
  asyncHandler(StudentEnrollmentController.getMyEnrolledCourses)
);

router.get(
  '/schedule',
  validate({ query: weeklyScheduleQuerySchema }),
  asyncHandler(StudentEnrollmentController.getWeeklySchedule)
);

router.get(
  '/schedule/weekly',
  validate({ query: weeklyScheduleQuerySchema }),
  asyncHandler(StudentEnrollmentController.getWeeklyScheduleComprehensive)
);

router.get(
  '/schedule/weekly/by-course/:courseId',
  validate({ params: courseIdParamSchema, query: weeklyScheduleQuerySchema }),
  asyncHandler(StudentEnrollmentController.getWeeklyScheduleByCourse)
);

export default router;
