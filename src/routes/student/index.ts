import { Router } from 'express';
import courseBookingRoutes from './course-booking.routes';
import courseRoutes from './course.routes';
import enrollmentRoutes from './enrollment.routes';
import attendanceRoutes from './attendance.routes';

const router = Router();

// Student course booking routes
router.use('/bookings', courseBookingRoutes);
router.use('/courses', courseRoutes);
router.use('/enrollments', enrollmentRoutes);
router.use('/attendance', attendanceRoutes);

export default router;
