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

const router = Router();

// تطبيق المسارات
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
router.use('/subscription-packages', subscriptionPackageRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/academic-years', academicYearRoutes);
router.use('/expenses', expenseRoutes);
router.use('/reports', reportRoutes);
router.use('/profile', profileRoutes);
router.use('/wallet', walletRoutes);

export default router;
