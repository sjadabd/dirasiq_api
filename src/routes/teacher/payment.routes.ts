import { Router } from 'express';

import { TeacherPaymentController } from '../../controllers/teacher/payment.controller';
import { TeacherWaylPaymentController } from '../../controllers/teacher/wayl-payment.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { bookingIdParamSchema } from '../../schemas/common.schemas';
import {
  reservationListQuerySchema,
  reservationReportQuerySchema,
  waylSubscriptionLinkSchema,
  waylWalletTopupLinkSchema,
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

// POST /teacher/payments/wayl/subscription-link
router.post(
  '/wayl/subscription-link',
  validate({ body: waylSubscriptionLinkSchema }),
  asyncHandler(TeacherWaylPaymentController.createSubscriptionLink)
);

// POST /teacher/payments/wayl/wallet-topup-link
router.post(
  '/wayl/wallet-topup-link',
  validate({ body: waylWalletTopupLinkSchema }),
  asyncHandler(TeacherWaylPaymentController.createWalletTopupLink)
);

export default router;
