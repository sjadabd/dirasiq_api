import { Router } from 'express';

import { TeacherCourseBookingController } from '../../controllers/teacher/course-booking.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema } from '../../schemas/common.schemas';
import {
  bookingConfirmBodySchema,
  bookingPreApproveBodySchema,
  bookingReactivateBodySchema,
  bookingRejectBodySchema,
  bookingStatsQuerySchema,
  bookingTeacherResponseBodySchema,
  teacherBookingsListQuerySchema,
} from '../../schemas/teacher.schemas';

const router = Router();

// Static paths first to avoid the `:id` matcher swallowing them.
router.get(
  '/subscription/remaining-students',
  asyncHandler(TeacherCourseBookingController.getRemainingStudents)
);

router.get(
  '/stats/summary',
  validate({ query: bookingStatsQuerySchema }),
  asyncHandler(TeacherCourseBookingController.getBookingStats)
);

router.get(
  '/',
  validate({ query: teacherBookingsListQuerySchema }),
  asyncHandler(TeacherCourseBookingController.getMyBookings)
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(TeacherCourseBookingController.getBookingById)
);

router.patch(
  '/:id/pre-approve',
  validate({ params: idParamSchema, body: bookingPreApproveBodySchema }),
  asyncHandler(TeacherCourseBookingController.preApproveBooking)
);

router.patch(
  '/:id/confirm',
  validate({ params: idParamSchema, body: bookingConfirmBodySchema }),
  asyncHandler(TeacherCourseBookingController.confirmBooking)
);

router.patch(
  '/:id/reject',
  validate({ params: idParamSchema, body: bookingRejectBodySchema }),
  asyncHandler(TeacherCourseBookingController.rejectBooking)
);

router.patch(
  '/:id/response',
  validate({ params: idParamSchema, body: bookingTeacherResponseBodySchema }),
  asyncHandler(TeacherCourseBookingController.updateTeacherResponse)
);

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(TeacherCourseBookingController.deleteBooking)
);

router.patch(
  '/:id/reactivate',
  validate({ params: idParamSchema, body: bookingReactivateBodySchema }),
  asyncHandler(TeacherCourseBookingController.reactivateBooking)
);

export default router;
