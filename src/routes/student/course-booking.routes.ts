import { Router } from 'express';
import { StudentCourseBookingController } from '../../controllers/student/course-booking.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Create a new course booking
router.post('/', StudentCourseBookingController.createBooking);

// Get all bookings for the current student
router.get('/', StudentCourseBookingController.getMyBookings);

// Get a specific booking by ID
router.get('/:id', StudentCourseBookingController.getBookingById);

// Cancel a booking
router.patch('/:id/cancel', StudentCourseBookingController.cancelBooking);

// Reactivate a cancelled booking
router.patch('/:id/reactivate', StudentCourseBookingController.reactivateBooking);

// Delete a booking (soft delete)
router.delete('/:id', StudentCourseBookingController.deleteBooking);

// Get booking statistics
router.get('/stats/summary', StudentCourseBookingController.getBookingStats);

export default router;
