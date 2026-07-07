// Teacher router.
//
// Phase 1.B-1 invariant: every endpoint under /api/teacher/* requires
// authentication + the teacher role, applied at the router level.
//
// (Phase 7) The legacy `/subscription-packages/*` mount with its
// public-read exceptions is gone alongside the rest of the subscription
// model.
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
import commissionPreviewRoutes from './commission-preview.routes';
import invoiceRoutes from './invoice.routes';
import myGradesRoutes from './my-grades.routes';
import notificationRoutes from './notification.routes';
import paymentRoutes from './payment.routes';
import profileRoutes from './profile.routes';
import reportRoutes from './report.routes';
import rosterRoutes from './roster.routes';
import sessionRoutes from './session.routes';
import studentEvaluationRoutes from './student-evaluation.routes';
import subjectRoutes from './subject.routes';
import videoCourseRoutes from './video-course.routes';
import walletRoutes from './wallet.routes';
import advertisementRoutes from './advertisement.routes';
import teacherNewsRoutes from './teacher-news.routes';

import { authenticateToken, requireRole } from '../../middleware/auth.middleware';
import { UserType } from '../../types';

const router = Router();

// Everything mounted under this router requires a valid teacher session.
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
router.use('/my-grades', myGradesRoutes);
router.use('/commission-preview', commissionPreviewRoutes);
router.use('/wallet', walletRoutes);
router.use('/advertisements', advertisementRoutes);
router.use('/news', teacherNewsRoutes);
router.use('/video-courses', videoCourseRoutes);

export default router;
