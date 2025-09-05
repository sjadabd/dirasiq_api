import { CourseBookingService } from '@/services/course-booking.service';
import { CreateCourseBookingRequest } from '@/types';
import { getMessage } from '@/utils/messages';
import { Request, Response } from 'express';

export class StudentCourseBookingController {
  // Create a new course booking
  static async createBooking(req: Request, res: Response): Promise<void> {
    try {
      const studentId = req.user?.id;
      if (!studentId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const data: CreateCourseBookingRequest = req.body;

      // Validate required fields
      if (!data.courseId) {
        res.status(400).json({
          success: false,
          message: getMessage('COURSE_BOOKING.COURSE_ID_REQUIRED'),
          errors: [getMessage('COURSE_BOOKING.COURSE_ID_REQUIRED')]
        });
        return;
      }

      const booking = await CourseBookingService.createBooking(studentId, data);

      res.status(201).json({
        success: true,
        message: getMessage('COURSE_BOOKING.CREATED'),
        data: booking
      });
    } catch (error: any) {
      if (error.message === 'Course not found') {
        res.status(404).json({
          success: false,
          message: getMessage('COURSE_BOOKING.COURSE_NOT_FOUND'),
          errors: [getMessage('COURSE_BOOKING.COURSE_NOT_FOUND')]
        });
      } else if (error.message === 'Booking already exists for this course') {
        res.status(409).json({
          success: false,
          message: getMessage('COURSE_BOOKING.EXISTING_BOOKING_INFO'),
          errors: [getMessage('COURSE_BOOKING.EXISTING_BOOKING_INFO')],
          suggestion: getMessage('COURSE_BOOKING.EXISTING_BOOKING_SUGGESTION'),
          action: getMessage('COURSE_BOOKING.ACTION_VIEW_EXISTING_BOOKING'),
          details: getMessage('COURSE_BOOKING.EXISTING_BOOKING_DETAILS')
        });
      } else if (error.code === '23505' && error.constraint === 'unique_student_course_booking') {
        res.status(409).json({
          success: false,
          message: getMessage('COURSE_BOOKING.EXISTING_BOOKING_INFO'),
          errors: [getMessage('COURSE_BOOKING.EXISTING_BOOKING_INFO')],
          suggestion: getMessage('COURSE_BOOKING.EXISTING_BOOKING_SUGGESTION'),
          action: getMessage('COURSE_BOOKING.ACTION_VIEW_EXISTING_BOOKING'),
          details: getMessage('COURSE_BOOKING.EXISTING_BOOKING_DETAILS')
        });
      } else {
        console.error('Error creating course booking:', error);
        res.status(500).json({
          success: false,
          message: getMessage('SERVER.INTERNAL_ERROR'),
          errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
        });
      }
    }
  }

  // Get all bookings for the current student
  static async getMyBookings(req: Request, res: Response): Promise<void> {
    try {
      const studentId = req.user?.id;
      if (!studentId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const studyYear = req.query['studyYear'] as string;
      if (!studyYear) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.STUDY_YEAR_REQUIRED'),
          errors: [getMessage('VALIDATION.STUDY_YEAR_REQUIRED')]
        });
        return;
      }

      const page = parseInt(req.query['page'] as string) || 1;
      const limit = parseInt(req.query['limit'] as string) || 10;
      const status = req.query['status'] as any;

      const result = await CourseBookingService.getStudentBookings(studentId, studyYear, page, limit, status);

      // Enhance response with reactivation information
      const enhancedBookings = result.bookings.map(booking => {
        const enhancedBooking: any = { ...booking };

        // Add reactivation info for cancelled bookings
        if (booking.status === 'cancelled') {
          enhancedBooking.canReactivate = booking.cancelledBy === 'student';
          enhancedBooking.cancelledBy = booking.cancelledBy;
          enhancedBooking.cancellationReason = booking.cancellationReason;
          enhancedBooking.cancelledAt = booking.cancelledAt;

          if (enhancedBooking.canReactivate) {
            // Check if course is still available for reactivation
            enhancedBooking.reactivationMessage = getMessage('COURSE_BOOKING.CAN_REACTIVATE');
            enhancedBooking.reactivationEndpoint = `/api/student/bookings/${booking.id}/reactivate`;
            enhancedBooking.reactivationNote = getMessage('COURSE_BOOKING.REACTIVATION_NOTE');
            enhancedBooking.reactivationSafe = getMessage('COURSE_BOOKING.REACTIVATION_SAFE');
          } else {
            enhancedBooking.reactivationMessage = getMessage('COURSE_BOOKING.CANNOT_REACTIVATE_TEACHER');
          }
        }

        // Add info for reactivated bookings
        if (booking.status === 'pending' && booking.reactivatedAt) {
          enhancedBooking.isReactivated = true;
          enhancedBooking.reactivatedAt = booking.reactivatedAt;
          enhancedBooking.reactivationNote = getMessage('COURSE_BOOKING.IS_REACTIVATED');
        }

        return enhancedBooking;
      });

      res.status(200).json({
        success: true,
        message: getMessage('COURSE_BOOKING.RETRIEVED_SUCCESSFULLY'),
        data: enhancedBookings,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit)
        }
      });
    } catch (error: any) {
      console.error('Error getting student bookings:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Get a specific booking by ID
  static async getBookingById(req: Request, res: Response): Promise<void> {
    try {
      const studentId = req.user?.id;
      if (!studentId) {
        res.status(401).json({
          success: false,
          message: getMessage('AUTH.AUTHENTICATION_REQUIRED'),
          errors: [getMessage('AUTH.USER_NOT_AUTHENTICATED')]
        });
        return;
      }

      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.BOOKING_ID_REQUIRED'),
          errors: [getMessage('VALIDATION.BOOKING_ID_REQUIRED')]
        });
        return;
      }

      const booking = await CourseBookingService.getBookingById(id);

      if (!booking) {
        res.status(404).json({
          success: false,
          message: getMessage('COURSE_BOOKING.NOT_FOUND'),
          errors: [getMessage('COURSE_BOOKING.NOT_FOUND')]
        });
        return;
      }

      // Check if the booking belongs to the current student
      if (booking.studentId !== studentId) {
        res.status(403).json({
          success: false,
          message: getMessage('COURSE_BOOKING.ACCESS_DENIED'),
          errors: [getMessage('COURSE_BOOKING.ACCESS_DENIED')]
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: getMessage('COURSE_BOOKING.RETRIEVED_SUCCESSFULLY'),
        data: booking
      });
    } catch (error: any) {
      console.error('Error getting booking:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Cancel a booking
  static async cancelBooking(req: Request, res: Response): Promise<void> {
    try {
      const studentId = req.user?.id;
      if (!studentId) {
        res.status(401).json({
          success: false,
          message: getMessage('AUTH.AUTHENTICATION_REQUIRED'),
          errors: [getMessage('AUTH.USER_NOT_AUTHENTICATED')]
        });
        return;
      }

      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.BOOKING_ID_REQUIRED'),
          errors: [getMessage('VALIDATION.BOOKING_ID_REQUIRED')]
        });
        return;
      }
      const { reason } = req.body;

      const booking = await CourseBookingService.cancelBooking(id, studentId, reason);

      res.status(200).json({
        success: true,
        message: getMessage('COURSE_BOOKING.CANCELLED'),
        data: booking
      });
    } catch (error: any) {
      if (error.message === 'Booking not found or access denied') {
        res.status(404).json({
          success: false,
          message: getMessage('COURSE_BOOKING.NOT_FOUND'),
          errors: [getMessage('COURSE_BOOKING.ACCESS_DENIED')]
        });
      } else {
        console.error('Error cancelling booking:', error);
        res.status(500).json({
          success: false,
          message: getMessage('SERVER.INTERNAL_ERROR'),
          errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
        });
      }
    }
  }

  // Reactivate a cancelled booking
  static async reactivateBooking(req: Request, res: Response): Promise<void> {
    try {
      const studentId = req.user?.id;
      if (!studentId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: 'Booking ID is required' });
        return;
      }

      const booking = await CourseBookingService.reactivateBooking(id, studentId);

      // Check if there's a course ended warning
      if ((booking as any).courseEndedWarning) {
        res.status(200).json({
          success: true,
          message: getMessage('COURSE_BOOKING.REACTIVATED_WITH_WARNING'),
          data: booking,
          warning: {
            message: getMessage('COURSE_BOOKING.REACTIVATED_COURSE_ENDED'),
            note: getMessage('COURSE_BOOKING.SUGGESTION_CONTACT_TEACHER'),
            action: getMessage('COURSE_BOOKING.ACTION_CONTACT_TEACHER')
          }
        });
      } else {
        res.status(200).json({
          success: true,
          message: getMessage('COURSE_BOOKING.REACTIVATED'),
          data: booking
        });
      }
    } catch (error: any) {
      if (error.message === 'Booking not found') {
        res.status(404).json({
          success: false,
          message: getMessage('COURSE_BOOKING.NOT_FOUND'),
          errors: [getMessage('COURSE_BOOKING.NOT_FOUND')]
        });
      } else if (error.message === 'Access denied - booking does not belong to you') {
        res.status(403).json({
          success: false,
          message: getMessage('COURSE_BOOKING.ACCESS_DENIED'),
          errors: [getMessage('COURSE_BOOKING.ACCESS_DENIED')]
        });
      } else if (error.message === 'Booking is already active and pending') {
        res.status(400).json({
          success: false,
          message: getMessage('COURSE_BOOKING.ALREADY_ACTIVE'),
          errors: [getMessage('COURSE_BOOKING.ALREADY_ACTIVE')],
          suggestion: getMessage('COURSE_BOOKING.SUGGESTION_CHECK_STATUS'),
          action: getMessage('COURSE_BOOKING.ACTION_CHECK_STATUS')
        });
      } else if (error.message === 'Booking is already approved and active') {
        res.status(400).json({
          success: false,
          message: getMessage('COURSE_BOOKING.ALREADY_APPROVED'),
          errors: [getMessage('COURSE_BOOKING.ALREADY_APPROVED')],
          suggestion: getMessage('COURSE_BOOKING.SUGGESTION_CHECK_STATUS'),
          action: getMessage('COURSE_BOOKING.ACTION_CHECK_STATUS')
        });
      } else if (error.message === 'Cannot reactivate rejected bookings. Please create a new booking instead.') {
        res.status(400).json({
          success: false,
          message: getMessage('COURSE_BOOKING.CANNOT_REACTIVATE_REJECTED'),
          errors: [getMessage('COURSE_BOOKING.CANNOT_REACTIVATE_REJECTED')],
          suggestion: getMessage('COURSE_BOOKING.SUGGESTION_CREATE_NEW'),
          action: getMessage('COURSE_BOOKING.ACTION_CREATE_NEW_BOOKING')
        });
      } else if (error.message.includes('Cannot reactivate booking with status:')) {
        res.status(400).json({
          success: false,
          message: getMessage('COURSE_BOOKING.INVALID_STATUS_FOR_REACTIVATION'),
          errors: [getMessage('COURSE_BOOKING.INVALID_STATUS_FOR_REACTIVATION')],
          suggestion: getMessage('COURSE_BOOKING.SUGGESTION_CREATE_NEW'),
          currentStatus: error.message.split(':')[1]?.trim(),
          action: getMessage('COURSE_BOOKING.ACTION_CHECK_BOOKING_STATUS')
        });
      } else if (error.message === 'Cannot reactivate bookings cancelled by teacher') {
        res.status(403).json({
          success: false,
          message: getMessage('COURSE_BOOKING.CANNOT_REACTIVATE_TEACHER_CANCELLED'),
          errors: [getMessage('COURSE_BOOKING.CANNOT_REACTIVATE_TEACHER_CANCELLED')]
        });
      } else if (error.message === 'Course is no longer available') {
        res.status(400).json({
          success: false,
          message: getMessage('COURSE_BOOKING.COURSE_NOT_AVAILABLE'),
          errors: [getMessage('COURSE_BOOKING.COURSE_NOT_AVAILABLE')]
        });
      } else if (error.message === 'Course has already ended') {
        res.status(400).json({
          success: false,
          message: getMessage('COURSE_BOOKING.COURSE_ENDED'),
          errors: [getMessage('COURSE_BOOKING.COURSE_ENDED')],
          suggestion: getMessage('COURSE_BOOKING.SUGGESTION_SEARCH_NEW_COURSES'),
          details: getMessage('COURSE_BOOKING.COURSE_ENDED_DETAILS')
        });
      } else {
        console.error('Error reactivating booking:', error);
        res.status(500).json({
          success: false,
          message: getMessage('SERVER.INTERNAL_ERROR'),
          errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
        });
      }
    }
  }

  // Delete a booking (soft delete)
  static async deleteBooking(req: Request, res: Response): Promise<void> {
    try {
      const studentId = req.user?.id;
      if (!studentId) {
        res.status(401).json({
          success: false,
          message: getMessage('AUTH.AUTHENTICATION_REQUIRED'),
          errors: [getMessage('AUTH.USER_NOT_AUTHENTICATED')]
        });
        return;
      }

      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.BOOKING_ID_REQUIRED'),
          errors: [getMessage('VALIDATION.BOOKING_ID_REQUIRED')]
        });
        return;
      }

      await CourseBookingService.deleteBooking(id, studentId, 'student');

      res.status(200).json({
        success: true,
        message: getMessage('COURSE_BOOKING.DELETED')
      });
    } catch (error: any) {
      if (error.message === 'Booking not found or access denied') {
        res.status(404).json({
          success: false,
          message: getMessage('COURSE_BOOKING.NOT_FOUND'),
          errors: [getMessage('COURSE_BOOKING.ACCESS_DENIED')]
        });
      } else {
        console.error('Error deleting booking:', error);
        res.status(500).json({
          success: false,
          message: getMessage('SERVER.INTERNAL_ERROR'),
          errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
        });
      }
    }
  }

  // Get booking statistics for the current student
  static async getBookingStats(req: Request, res: Response): Promise<void> {
    try {
      const studentId = req.user?.id;
      if (!studentId) {
        res.status(401).json({
          success: false,
          message: getMessage('AUTH.AUTHENTICATION_REQUIRED'),
          errors: [getMessage('AUTH.USER_NOT_AUTHENTICATED')]
        });
        return;
      }

      const studyYear = req.query['studyYear'] as string;
      if (!studyYear) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.STUDY_YEAR_REQUIRED'),
          errors: [getMessage('VALIDATION.STUDY_YEAR_REQUIRED')]
        });
        return;
      }

      const approvedCount = await CourseBookingService.getApprovedBookingsCount(studentId, studyYear);

      res.status(200).json({
        success: true,
        message: getMessage('COURSE_BOOKING.STATS_RETRIEVED'),
        data: {
          approvedBookings: approvedCount
        }
      });
    } catch (error: any) {
      console.error('Error getting booking statistics:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }
}
