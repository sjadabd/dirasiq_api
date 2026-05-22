import { Router } from 'express';

import { TeacherPaymentController } from '../../controllers/teacher/payment.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { bookingIdParamSchema } from '../../schemas/common.schemas';
import {
  reservationListQuerySchema,
  reservationReportQuerySchema,
} from '../../schemas/teacher.schemas';

const router = Router();

// GET /teacher/payments/reservations
router.get(
  '/reservations',
  validate({ query: reservationListQuerySchema }),
  asyncHandler(TeacherPaymentController.getReservationPayments)
);

// GET /teacher/payments/reservations/report
router.get(
  '/reservations/report',
  validate({ query: reservationReportQuerySchema }),
  asyncHandler(TeacherPaymentController.getReservationPaymentsReport)
);

// GET /teacher/payments/reservations/:bookingId
router.get(
  '/reservations/:bookingId',
  validate({ params: bookingIdParamSchema }),
  asyncHandler(TeacherPaymentController.getReservationPaymentByBooking)
);

// PATCH /teacher/payments/reservations/:bookingId/mark-paid
router.patch(
  '/reservations/:bookingId/mark-paid',
  validate({ params: bookingIdParamSchema }),
  asyncHandler(TeacherPaymentController.markReservationPaid)
);

// (Phase 7) Removed: /wayl/subscription-link + /wayl/wallet-topup-link.
// Subscription model is gone; the new commission + wallet flow credits
// teachers automatically from student course purchases (see Phase 9+).

export default router;
