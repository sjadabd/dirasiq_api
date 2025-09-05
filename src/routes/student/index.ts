import { Router } from 'express';
import courseBookingRoutes from './course-booking.routes';
import courseRoutes from './course.routes';

const router = Router();

// Student course routes
router.use('/courses', courseRoutes);

// Student course booking routes
router.use('/bookings', courseBookingRoutes);

export default router;
