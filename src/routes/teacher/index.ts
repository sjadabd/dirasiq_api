import { Router } from 'express';
import courseBookingRoutes from './course-booking.routes';
import courseRoutes from './course.routes';
import subjectRoutes from './subject.routes';
import sessionRoutes from './session.routes';
import notificationRoutes from './notification.routes';

const router = Router();

// تطبيق المسارات
router.use('/courses', courseRoutes);
router.use('/subjects', subjectRoutes);
router.use('/bookings', courseBookingRoutes);
router.use('/sessions', sessionRoutes);
router.use('/notifications', notificationRoutes);

export default router;
