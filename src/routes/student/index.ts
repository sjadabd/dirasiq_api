import { Router } from 'express';
import courseBookingRoutes from './course-booking.routes';
import courseRoutes from './course.routes';

const router = Router();

// Student course booking routes
router.use('/bookings', courseBookingRoutes);
router.use('/courses', courseRoutes);

export default router;
