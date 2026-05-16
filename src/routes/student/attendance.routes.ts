import { Router } from 'express';

import { StudentAttendanceController } from '../../controllers/student/attendance.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { courseIdParamSchema } from '../../schemas/common.schemas';
import { attendanceCheckInBodySchema } from '../../schemas/student.schemas';

const router = Router();

router.post(
  '/check-in',
  validate({ body: attendanceCheckInBodySchema }),
  asyncHandler(StudentAttendanceController.checkIn)
);

router.get(
  '/by-course/:courseId',
  validate({ params: courseIdParamSchema }),
  asyncHandler(StudentAttendanceController.getMyAttendanceByCourse)
);

export default router;
