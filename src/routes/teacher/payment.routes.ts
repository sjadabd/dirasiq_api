import { Router } from 'express';
import { authenticateToken } from '@/middleware/auth.middleware';
import { TeacherPaymentController } from '@/controllers/teacher/payment.controller';

const router = Router();

router.use(authenticateToken);

// List reservation payments with pagination and basic info
// GET /teacher/payments/reservations?studyYear=YYYY-YYYY&page=1&limit=10
router.get('/reservations', TeacherPaymentController.getReservationPayments);

// Summary report (totals)
// GET /teacher/payments/reservations/report?studyYear=YYYY-YYYY
router.get('/reservations/report', TeacherPaymentController.getReservationPaymentsReport);

// Single booking payment detail
// GET /teacher/payments/reservations/:bookingId
router.get('/reservations/:bookingId', TeacherPaymentController.getReservationPaymentByBooking);

export default router;
