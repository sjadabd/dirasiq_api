import { Router } from 'express';
import courseBookingRoutes from './course-booking.routes';
import courseRoutes from './course.routes';

const router = Router();

// تطبيق المسارات
router.use('/', courseRoutes);

// Student course booking routes
router.use('/bookings', courseBookingRoutes);

export default router;
