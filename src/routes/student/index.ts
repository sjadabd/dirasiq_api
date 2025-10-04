import { Router } from 'express';
import assignmentRoutes from './assignment.routes';
import attendanceRoutes from './attendance.routes';
import courseRoutes from './course.routes';
import courseBookingRoutes from './course-booking.routes';
import examRoutes from './exam.routes';
import enrollmentRoutes from './enrollment.routes';
import invoiceRoutes from './invoice.routes';
import studentEvaluationRoutes from './student-evaluation.routes';
import teacherRoutes from './teacher.routes';
import dashboardRoutes from './dashboard.routes';
import searchRoutes from './search.routes';

const router = Router();

router.use('/assignments', assignmentRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/courses', courseRoutes);
router.use('/course-bookings', courseBookingRoutes);
router.use('/bookings', courseBookingRoutes);
router.use('/exams', examRoutes);
router.use('/enrollment', enrollmentRoutes);
router.use('/enrollments', enrollmentRoutes);
router.use('/evaluations', studentEvaluationRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/teachers', teacherRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/search', searchRoutes);

export default router;

