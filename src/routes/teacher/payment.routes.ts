import { Router } from 'express';
import { TeacherPaymentController } from '../../controllers/teacher/payment.controller';
import { TeacherWaylPaymentController } from '../../controllers/teacher/wayl-payment.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

// List reservation payments with pagination and basic info
// GET /teacher/payments/reservations?studyYear=YYYY-YYYY&page=1&limit=10
router.get('/reservations', TeacherPaymentController.getReservationPayments);

// Summary report (totals)
// GET /teacher/payments/reservations/report?studyYear=YYYY-YYYY
router.get(
  '/reservations/report',
  TeacherPaymentController.getReservationPaymentsReport
);

// Single booking payment detail
// GET /teacher/payments/reservations/:bookingId
router.get(
  '/reservations/:bookingId',
  TeacherPaymentController.getReservationPaymentByBooking
);

// Mark a specific reservation payment as paid
// PATCH /teacher/payments/reservations/:bookingId/mark-paid
router.patch(
  '/reservations/:bookingId/mark-paid',
  TeacherPaymentController.markReservationPaid
);

// Create Wayl payment link for subscription purchase
// POST /teacher/payments/wayl/subscription-link
router.post(
  '/wayl/subscription-link',
  TeacherWaylPaymentController.createSubscriptionLink
);

// Create Wayl payment link for wallet top-up
// POST /teacher/payments/wayl/wallet-topup-link
router.post(
  '/wayl/wallet-topup-link',
  TeacherWaylPaymentController.createWalletTopupLink
);

export default router;
