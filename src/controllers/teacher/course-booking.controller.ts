import { TeacherSubscriptionModel } from '@/models/teacher-subscription.model';
import { CourseBookingService } from '@/services/course-booking.service';
import { BookingStatus, UpdateCourseBookingRequest } from '@/types';
import { getMessage } from '@/utils/messages';
import { Request, Response } from 'express';

export class TeacherCourseBookingController {
  // Get all bookings for the current teacher
  static async getMyBookings(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId) {
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

      const result = await CourseBookingService.getTeacherBookings(teacherId, studyYear, page, limit, status);

      res.status(200).json({
        success: true,
        message: getMessage('COURSE_BOOKING.RETRIEVED_SUCCESSFULLY'),
        data: result.bookings,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit)
        }
      });
    } catch (error: any) {
      console.error('Error getting teacher bookings:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Get a specific booking by ID with details
  static async getBookingById(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId) {
        res.status(401).json({ error: 'Unauthorized' });
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

      const booking = await CourseBookingService.getBookingByIdWithDetails(id);

      if (!booking) {
        res.status(404).json({
          success: false,
          message: getMessage('COURSE_BOOKING.NOT_FOUND'),
          errors: [getMessage('COURSE_BOOKING.NOT_FOUND')]
        });
        return;
      }

      // Check if the booking belongs to the current teacher
      if (booking.teacherId !== teacherId) {
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

  // Approve a booking
  static async approveBooking(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId) {
        res.status(401).json({ error: 'Unauthorized' });
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

      const { teacherResponse } = req.body;

      const data: UpdateCourseBookingRequest = {
        status: BookingStatus.APPROVED,
        teacherResponse
      };

      const booking = await CourseBookingService.updateBookingStatus(id, teacherId, data);

      res.status(200).json({
        success: true,
        message: getMessage('COURSE_BOOKING.APPROVED'),
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
        console.error('Error approving booking:', error);
        res.status(500).json({
          success: false,
          message: getMessage('SERVER.INTERNAL_ERROR'),
          errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
        });
      }
    }
  }

  // Reject a booking
  static async rejectBooking(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId) {
        res.status(401).json({ error: 'Unauthorized' });
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

      const { rejectionReason, teacherResponse } = req.body;

      if (!rejectionReason) {
        res.status(400).json({
          success: false,
          message: getMessage('COURSE_BOOKING.REJECTION_REASON_REQUIRED'),
          errors: [getMessage('COURSE_BOOKING.REJECTION_REASON_REQUIRED')]
        });
        return;
      }

      const data: UpdateCourseBookingRequest = {
        status: BookingStatus.REJECTED,
        rejectionReason,
        teacherResponse
      };

      const booking = await CourseBookingService.updateBookingStatus(id, teacherId, data);

      res.status(200).json({
        success: true,
        message: getMessage('COURSE_BOOKING.REJECTED'),
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
        console.error('Error rejecting booking:', error);
        res.status(500).json({
          success: false,
          message: getMessage('SERVER.INTERNAL_ERROR'),
          errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
        });
      }
    }
  }

  // Update teacher response for a booking
  static async updateTeacherResponse(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId) {
        res.status(401).json({ error: 'Unauthorized' });
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

      const { teacherResponse } = req.body;

      if (!teacherResponse) {
        res.status(400).json({
          success: false,
          message: getMessage('COURSE_BOOKING.TEACHER_RESPONSE_OPTIONAL'),
          errors: [getMessage('COURSE_BOOKING.TEACHER_RESPONSE_OPTIONAL')]
        });
        return;
      }

      const data: UpdateCourseBookingRequest = {
        teacherResponse
      };

      const booking = await CourseBookingService.updateBookingStatus(id, teacherId, data);

      res.status(200).json({
        success: true,
        message: getMessage('COURSE_BOOKING.STATUS_UPDATED'),
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
        console.error('Error updating teacher response:', error);
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
      const teacherId = req.user?.id;
      if (!teacherId) {
        res.status(401).json({ error: 'Unauthorized' });
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

      await CourseBookingService.deleteBooking(id, teacherId, 'teacher');

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

  // Reactivate a rejected booking
  static async reactivateBooking(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId) {
        res.status(401).json({ error: 'Unauthorized' });
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

      const { teacherResponse } = req.body;

      // First, get the current booking to check its status
      const currentBooking = await CourseBookingService.getBookingByIdWithDetails(id);

      if (!currentBooking) {
        res.status(404).json({
          success: false,
          message: getMessage('COURSE_BOOKING.NOT_FOUND'),
          errors: [getMessage('COURSE_BOOKING.NOT_FOUND')]
        });
        return;
      }

      // Check if the booking belongs to the current teacher
      if (currentBooking.teacherId !== teacherId) {
        res.status(403).json({
          success: false,
          message: getMessage('COURSE_BOOKING.ACCESS_DENIED'),
          errors: [getMessage('COURSE_BOOKING.ACCESS_DENIED')]
        });
        return;
      }

      // Check if the booking is rejected
      if (currentBooking.status !== BookingStatus.REJECTED) {
        res.status(400).json({
          success: false,
          message: 'يمكن إعادة تفعيل الحجوزات المرفوضة فقط',
          errors: ['يمكن إعادة تفعيل الحجوزات المرفوضة فقط']
        });
        return;
      }

      // Check capacity before reactivating
      const capacityCheck = await TeacherSubscriptionModel.canAddStudent(teacherId);
      if (!capacityCheck.canAdd) {
        res.status(400).json({
          success: false,
          message: capacityCheck.message || 'لا يمكن إعادة تفعيل الحجز - الباقة ممتلئة',
          errors: [capacityCheck.message || 'لا يمكن إعادة تفعيل الحجز - الباقة ممتلئة']
        });
        return;
      }

      const data: UpdateCourseBookingRequest = {
        status: BookingStatus.APPROVED,
        teacherResponse
      };

      const booking = await CourseBookingService.updateBookingStatus(id, teacherId, data);

      res.status(200).json({
        success: true,
        message: 'تم إعادة تفعيل الحجز بنجاح',
        data: booking
      });
    } catch (error: any) {
      console.error('Error reactivating booking:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Get booking statistics for the current teacher
  static async getBookingStats(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId) {
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

      const pendingCount = await CourseBookingService.getPendingBookingsCount(teacherId, studyYear);

      res.status(200).json({
        success: true,
        message: getMessage('COURSE_BOOKING.STATS_RETRIEVED'),
        data: {
          pendingBookings: pendingCount
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
