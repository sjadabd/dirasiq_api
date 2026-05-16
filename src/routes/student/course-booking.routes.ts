import { Router } from 'express';

import { StudentCourseBookingController } from '../../controllers/student/course-booking.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema } from '../../schemas/common.schemas';
import {
  createCourseBookingSchema,
  studentBookingStatsQuerySchema,
  studentBookingsListQuerySchema,
  studentCancelBookingBodySchema,
} from '../../schemas/student.schemas';

const router = Router();

// Static path before `:id` matcher.
router.get(
  '/stats/summary',
  validate({ query: studentBookingStatsQuerySchema }),
  asyncHandler(StudentCourseBookingController.getBookingStats)
);

router.post(
  '/',
  validate({ body: createCourseBookingSchema }),
  asyncHandler(StudentCourseBookingController.createBooking)
);

router.get(
  '/',
  validate({ query: studentBookingsListQuerySchema }),
  asyncHandler(StudentCourseBookingController.getMyBookings)
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(StudentCourseBookingController.getBookingById)
);

router.patch(
  '/:id/cancel',
  validate({ params: idParamSchema, body: studentCancelBookingBodySchema }),
  asyncHandler(StudentCourseBookingController.cancelBooking)
);

router.patch(
  '/:id/reactivate',
  validate({ params: idParamSchema }),
  asyncHandler(StudentCourseBookingController.reactivateBooking)
);

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(StudentCourseBookingController.deleteBooking)
);

export default router;
