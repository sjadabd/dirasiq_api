import { TeacherCourseBookingController } from '@/controllers/teacher/course-booking.controller';
import { authenticateToken } from '@/middleware/auth.middleware';
import { Router } from 'express';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get all bookings for the current teacher
router.get('/', TeacherCourseBookingController.getMyBookings);

// Get a specific booking by ID with details
router.get('/:id', TeacherCourseBookingController.getBookingById);

// Pre-approve a booking (موافقة أولية)
router.patch('/:id/pre-approve', TeacherCourseBookingController.preApproveBooking);

// Confirm a booking (تأكيد الحجز)
router.patch('/:id/confirm', TeacherCourseBookingController.confirmBooking);

// Approve a booking
router.patch('/:id/approve', TeacherCourseBookingController.approveBooking);

// Reject a booking
router.patch('/:id/reject', TeacherCourseBookingController.rejectBooking);

// Update teacher response for a booking
router.patch('/:id/response', TeacherCourseBookingController.updateTeacherResponse);

// Delete a booking (soft delete)
router.delete('/:id', TeacherCourseBookingController.deleteBooking);

// Reactivate a rejected booking
router.patch('/:id/reactivate', TeacherCourseBookingController.reactivateBooking);

// Get booking statistics
router.get('/stats/summary', TeacherCourseBookingController.getBookingStats);

export default router;
