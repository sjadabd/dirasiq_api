import { Router } from 'express';
import { TeacherCourseBookingController } from '../../controllers/teacher/course-booking.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get remaining students capacity (static path should come before ':id')
router.get('/subscription/remaining-students', TeacherCourseBookingController.getRemainingStudents);

// Get pending booking statistics (place before ':id')
router.get('/stats/summary', TeacherCourseBookingController.getBookingStats);

// Get all bookings for the current teacher
router.get('/', TeacherCourseBookingController.getMyBookings);

// Get a specific booking by ID with details (dynamic route should come after static ones)
router.get('/:id', TeacherCourseBookingController.getBookingById);

// Pre-approve a booking (موافقة أولية)
router.patch('/:id/pre-approve', TeacherCourseBookingController.preApproveBooking);

// Confirm a booking (تأكيد الحجز)
router.patch('/:id/confirm', TeacherCourseBookingController.confirmBooking);

// Reject a booking
router.patch('/:id/reject', TeacherCourseBookingController.rejectBooking);

// Update teacher response for a booking
router.patch('/:id/response', TeacherCourseBookingController.updateTeacherResponse);

// Delete a booking (soft delete)
router.delete('/:id', TeacherCourseBookingController.deleteBooking);

// Reactivate a rejected booking
router.patch('/:id/reactivate', TeacherCourseBookingController.reactivateBooking);

// (moved static routes above)

export default router;
