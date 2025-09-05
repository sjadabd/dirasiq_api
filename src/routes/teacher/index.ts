import { Router } from 'express';
import courseBookingRoutes from './course-booking.routes';
import courseRoutes from './course.routes';
import subjectRoutes from './subject.routes';

const router = Router();

// تطبيق المسارات
router.use('/courses', courseRoutes);
router.use('/subjects', subjectRoutes);
router.use('/bookings', courseBookingRoutes);

export default router;
