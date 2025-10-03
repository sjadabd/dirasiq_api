import { Router } from 'express';
import courseBookingRoutes from './course-booking.routes';
import courseRoutes from './course.routes';
import enrollmentRoutes from './enrollment.routes';
import attendanceRoutes from './attendance.routes';
import assignmentRoutes from './assignment.routes';
import examRoutes from './exam.routes';
import studentEvaluationRoutes from './student-evaluation.routes';

const router = Router();

// Student course booking routes
router.use('/bookings', courseBookingRoutes);
router.use('/courses', courseRoutes);
router.use('/enrollments', enrollmentRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/assignments', assignmentRoutes);
router.use('/exams', examRoutes);
router.use('/evaluations', studentEvaluationRoutes);

export default router;
