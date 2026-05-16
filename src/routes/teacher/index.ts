// Teacher router.
//
// Phase 1.B-1 invariant: most endpoints under /api/teacher/* require
// authentication + the teacher role, applied at the router level so each
// sub-route file no longer needs `authenticateToken, requireTeacher` per
// handler.
//
// Exceptions mounted BEFORE the parent role gate (per-route auth instead):
//   - `/subscription-packages/*` — `GET /active` and `GET /:id` are public
//     (used by the marketing / pricing page for guests); only the
//     `POST /:id/activate` mutation is gated to TEACHER inside the sub-router.
//
// Other public surfaces live outside this router:
//   - `/api/payments/wayl/*` (webhook is public),
//   - `/api/teacher-search/*` (read-only, mounted at the top level),
//   - `/api/public/news`.

import { Router } from 'express';
import academicYearRoutes from './academic-year.routes';
import assignmentRoutes from './assignment.routes';
import courseBookingRoutes from './course-booking.routes';
import courseRoutes from './course.routes';
import dashboardRoutes from './dashboard.routes';
import examRoutes from './exam.routes';
import expenseRoutes from './expense.routes';
import invoiceRoutes from './invoice.routes';
import notificationRoutes from './notification.routes';
import paymentRoutes from './payment.routes';
import profileRoutes from './profile.routes';
import reportRoutes from './report.routes';
import rosterRoutes from './roster.routes';
import sessionRoutes from './session.routes';
import studentEvaluationRoutes from './student-evaluation.routes';
import subjectRoutes from './subject.routes';
import subscriptionPackageRoutes from './subscription-package.routes';
import walletRoutes from './wallet.routes';

import { authenticateToken, requireRole } from '../../middleware/auth.middleware';
import { UserType } from '../../types';

const router = Router();

// Mixed-auth sub-router — declares its own per-route middleware.
// MUST be mounted BEFORE the parent `requireRole(TEACHER)` line below,
// otherwise the public reads inside it would inherit the teacher gate.
router.use('/subscription-packages', subscriptionPackageRoutes);

// Everything mounted after this line requires a valid teacher session.
router.use(authenticateToken, requireRole(UserType.TEACHER));

router.use('/courses', courseRoutes);
router.use('/subjects', subjectRoutes);
router.use('/bookings', courseBookingRoutes);
router.use('/sessions', sessionRoutes);
router.use('/notifications', notificationRoutes);
router.use('/students', rosterRoutes);
router.use('/roster', rosterRoutes);
router.use('/assignments', assignmentRoutes);
router.use('/exams', examRoutes);
router.use('/evaluations', studentEvaluationRoutes);
router.use('/payments', paymentRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/academic-years', academicYearRoutes);
router.use('/expenses', expenseRoutes);
router.use('/reports', reportRoutes);
router.use('/profile', profileRoutes);
router.use('/wallet', walletRoutes);

export default router;
