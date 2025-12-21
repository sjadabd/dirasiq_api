import { Request, Response } from 'express';
import { CourseBookingModel } from '../../models/course-booking.model';
import { TeacherSubscriptionModel } from '../../models/teacher-subscription.model';
import { NotificationService } from '../../services/notification.service';
import { CourseBookingService } from '../../services/teacher/course-booking.service';
import {
  BookingStatus,
  CourseBooking,
  UpdateCourseBookingRequest,
} from '../../types';

export class TeacherCourseBookingController {
  private static notificationService: NotificationService;

  static {
    // Initialize notification service
    const oneSignalConfig = {
      appId: process.env['ONESIGNAL_APP_ID'] || '',
      restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || '',
    };
    this.notificationService = new NotificationService(oneSignalConfig);
  }

  // Get remaining students capacity for current teacher
  static async getRemainingStudents(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
      );
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.removeHeader('ETag');

      const teacherId = req.user?.id;
      if (!teacherId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const check = await TeacherSubscriptionModel.canAddStudent(teacherId);
      const remaining = Math.max(
        (check.maxStudents || 0) - (check.currentStudents || 0),
        0
      );

      if (!check.canAdd && check.maxStudents === 0) {
        res.status(200).json({
          success: true,
          message: check.message || 'لا يوجد اشتراك فعال للمعلم',
          data: {
            currentStudents: check.currentStudents,
            maxStudents: check.maxStudents,
            remaining,
            canAdd: false,
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'تم جلب سعة الاشتراك بنجاح',
        data: {
          currentStudents: check.currentStudents,
          maxStudents: check.maxStudents,
          remaining,
          canAdd: check.canAdd,
        },
      });
    } catch (error) {
      console.error('Error getting remaining students:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

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
          message: 'السنة الدراسية مطلوبة',
          errors: ['السنة الدراسية مطلوبة'],
        });
        return;
      }

      const page = parseInt(req.query['page'] as string) || 1;
      const limit = parseInt(req.query['limit'] as string) || 10;

      // ✅ تنظيف قيمة status
      let status = req.query['status'] as string | undefined;
      if (!status || status === 'null' || status.trim() === '') {
        status = undefined;
      }

      const result = await CourseBookingService.getTeacherBookings(
        teacherId,
        studyYear,
        page,
        limit,
        status as any
      );

      res.status(200).json({
        success: true,
        message: 'تم استرجاع الحجوزات بنجاح',
        data: result.bookings,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error: any) {
      console.error('Error getting teacher bookings:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
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
          message: 'معرف الحجز مطلوب',
          errors: ['معرف الحجز مطلوب'],
        });
        return;
      }

      const booking = await CourseBookingService.getBookingByIdWithDetails(id);

      if (!booking) {
        res.status(404).json({
          success: false,
          message: 'الحجز غير موجود',
          errors: ['الحجز غير موجود'],
        });
        return;
      }

      // Check if the booking belongs to the current teacher
      if (booking.teacherId !== teacherId) {
        res.status(403).json({
          success: false,
          message: 'الوصول مرفوض',
          errors: ['الوصول مرفوض'],
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'تم استرجاع الحجوزات بنجاح',
        data: booking,
      });
    } catch (error: any) {
      console.error('Error getting booking:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }

  // Pre-approve a booking
  static async preApproveBooking(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, message: 'معرف الحجز مطلوب' });
        return;
      }

      const { teacherResponse } = req.body;

      const data: UpdateCourseBookingRequest = {
        status: BookingStatus.PRE_APPROVED,
        teacherResponse,
      };

      const booking = await CourseBookingService.updateBookingStatus(
        id,
        teacherId,
        data
      );
      await TeacherCourseBookingController.sendBookingStatusNotification(
        booking
      );

      res.status(200).json({
        success: true,
        message: 'تم إعطاء موافقة أولية للحجز',
        data: booking,
      });
    } catch (error: any) {
      console.error('Error pre-approving booking:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // Confirm a booking
  static async confirmBooking(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, message: 'معرف الحجز مطلوب' });
        return;
      }

      const { teacherResponse, reservationPaid } = req.body;

      // تحقق من أن الحجز في حالة موافقة أولية قبل التأكيد
      const currentBooking =
        await CourseBookingService.getBookingByIdWithDetails(id);
      if (!currentBooking) {
        res.status(404).json({ success: false, message: 'الحجز غير موجود' });
        return;
      }
      if (currentBooking.status !== BookingStatus.PRE_APPROVED) {
        res.status(400).json({
          success: false,
          message: 'يمكن تأكيد الحجز فقط بعد الموافقة الأولية',
        });
        return;
      }

      const data: UpdateCourseBookingRequest & { reservationPaid?: boolean } = {
        status: BookingStatus.CONFIRMED,
        teacherResponse,
        reservationPaid,
      };

      const booking = await CourseBookingService.updateBookingStatus(
        id,
        teacherId,
        data
      );
      await TeacherCourseBookingController.sendBookingStatusNotification(
        booking
      );

      res.status(200).json({
        success: true,
        message: 'تم تأكيد الحجز بنجاح',
        data: booking,
      });
    } catch (error: any) {
      const msg: string = error?.message || '';
      // Map known capacity/subscription errors to user-friendly responses
      if (
        msg === 'لا يوجد اشتراك فعال للمعلم' ||
        msg === 'انتهت صلاحية الاشتراك' ||
        msg.includes('الباقة ممتلئة') ||
        msg.includes('لا يمكن تأكيد الحجز')
      ) {
        res.status(400).json({
          success: false,
          message: msg || 'لا يمكن تأكيد الحجز بسبب قيود الاشتراك',
          errors: [msg || 'يرجى تفعيل أو ترقية الاشتراك قبل تأكيد الحجز'],
        });
        return;
      }
      console.error('Error confirming booking:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
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
          message: 'معرف الحجز مطلوب',
          errors: ['معرف الحجز مطلوب'],
        });
        return;
      }

      const { rejectionReason, teacherResponse } = req.body;

      if (!rejectionReason) {
        res.status(400).json({
          success: false,
          message: 'سبب الرفض مطلوب',
          errors: ['سبب الرفض مطلوب'],
        });
        return;
      }

      const data: UpdateCourseBookingRequest = {
        status: BookingStatus.REJECTED,
        rejectionReason,
        teacherResponse,
      };

      const booking = await CourseBookingService.updateBookingStatus(
        id,
        teacherId,
        data
      );
      await TeacherCourseBookingController.sendBookingStatusNotification(
        booking
      );

      res.status(200).json({
        success: true,
        message: 'تم رفض الحجز',
        data: booking,
      });
    } catch (error: any) {
      if (error.message === 'Booking not found or access denied') {
        res.status(404).json({
          success: false,
          message: 'الحجز غير موجود',
          errors: ['الوصول مرفوض'],
        });
      } else {
        console.error('Error rejecting booking:', error);
        res.status(500).json({
          success: false,
          message: 'خطأ داخلي في الخادم',
          errors: ['حدث خطأ في الخادم'],
        });
      }
    }
  }

  // Update teacher response for a booking
  static async updateTeacherResponse(
    req: Request,
    res: Response
  ): Promise<void> {
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
          message: 'معرف الحجز مطلوب',
          errors: ['معرف الحجز مطلوب'],
        });
        return;
      }

      const { teacherResponse } = req.body;

      if (!teacherResponse) {
        res.status(400).json({
          success: false,
          message: 'رد المعلم اختياري',
          errors: ['رد المعلم اختياري'],
        });
        return;
      }

      const data: UpdateCourseBookingRequest = {
        teacherResponse,
      };

      const booking = await CourseBookingService.updateBookingStatus(
        id,
        teacherId,
        data
      );
      await TeacherCourseBookingController.sendBookingStatusNotification(
        booking
      );

      res.status(200).json({
        success: true,
        message: 'تم تحديث حالة الحجز',
        data: booking,
      });
    } catch (error: any) {
      if (error.message === 'Booking not found or access denied') {
        res.status(404).json({
          success: false,
          message: 'الحجز غير موجود',
          errors: ['الوصول مرفوض'],
        });
      } else {
        console.error('Error updating teacher response:', error);
        res.status(500).json({
          success: false,
          message: 'خطأ داخلي في الخادم',
          errors: ['حدث خطأ في الخادم'],
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
          message: 'معرف الحجز مطلوب',
          errors: ['معرف الحجز مطلوب'],
        });
        return;
      }

      await CourseBookingService.deleteBooking(id, teacherId, 'teacher');

      res.status(200).json({
        success: true,
        message: 'تم حذف الحجز',
      });
    } catch (error: any) {
      if (error.message === 'Booking not found or access denied') {
        res.status(404).json({
          success: false,
          message: 'الحجز غير موجود',
          errors: ['الوصول مرفوض'],
        });
      } else {
        console.error('Error deleting booking:', error);
        res.status(500).json({
          success: false,
          message: 'خطأ داخلي في الخادم',
          errors: ['حدث خطأ في الخادم'],
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
          message: 'معرف الحجز مطلوب',
          errors: ['معرف الحجز مطلوب'],
        });
        return;
      }

      const { teacherResponse } = req.body;

      // First, get the current booking to check its status
      const currentBooking =
        await CourseBookingService.getBookingByIdWithDetails(id);

      if (!currentBooking) {
        res.status(404).json({
          success: false,
          message: 'الحجز غير موجود',
          errors: ['الحجز غير موجود'],
        });
        return;
      }

      // Check if the booking belongs to the current teacher
      if (currentBooking.teacherId !== teacherId) {
        res.status(403).json({
          success: false,
          message: 'الوصول مرفوض',
          errors: ['الوصول مرفوض'],
        });
        return;
      }

      // Check if the booking is rejected
      if (currentBooking.status !== BookingStatus.REJECTED) {
        res.status(400).json({
          success: false,
          message: 'يمكن إعادة تفعيل الحجوزات المرفوضة فقط',
          errors: ['يمكن إعادة تفعيل الحجوزات المرفوضة فقط'],
        });
        return;
      }

      // تمت إزالة التحقق من السعة عند إعادة التفعيل. سيتم التحقق عند التأكيد.

      const data: UpdateCourseBookingRequest = {
        status: BookingStatus.PRE_APPROVED,
        teacherResponse,
      };

      const booking = await CourseBookingService.updateBookingStatus(
        id,
        teacherId,
        data
      );
      await TeacherCourseBookingController.sendBookingStatusNotification(
        booking
      );

      res.status(200).json({
        success: true,
        message: 'تم إعادة تفعيل الحجز بنجاح',
        data: booking,
      });
    } catch (error: any) {
      console.error('Error reactivating booking:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
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
          message: 'السنة الدراسية مطلوبة',
          errors: ['السنة الدراسية مطلوبة'],
        });
        return;
      }

      const pendingCount = await CourseBookingService.getPendingBookingsCount(
        teacherId,
        studyYear
      );

      res.status(200).json({
        success: true,
        message: 'تم استرجاع إحصائيات الحجز',
        data: {
          pendingBookings: pendingCount,
        },
      });
    } catch (error: any) {
      console.error('Error getting booking statistics:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }

  // Send notification to student about booking status change
  private static async sendBookingStatusNotification(
    booking: CourseBooking
  ): Promise<void> {
    try {
      // Get booking details with course and student information
      const bookingDetails = await CourseBookingModel.findByIdWithDetails(
        booking.id
      );

      if (!bookingDetails) {
        console.error('Could not find booking details for notification');
        return;
      }

      const { course, student } = bookingDetails;

      // اختر الرسالة حسب الحالة
      let message = '';
      switch (booking.status) {
        case BookingStatus.PRE_APPROVED:
          message = `تمت الموافقة الأولية على طلبك في دورة ${course.courseName}. نرجو حضورك في الموعد المحدد لتائكيد حجزك.`;
          break;
        case BookingStatus.CONFIRMED:
          message = `تم تأكيد حجزك في دورة ${course.courseName}. مرحبا بك.`;
          break;
        case BookingStatus.APPROVED:
          message = `تمت الموافقة النهائية على طلبك في دورة ${course.courseName}.`;
          break;
        case BookingStatus.REJECTED:
          message = `تم رفض طلبك في دورة ${course.courseName}.`;
          break;
        case BookingStatus.CANCELLED:
          message = `تم إلغاء حجزك في دورة ${course.courseName}.`;
          break;
        default:
          message = `تحديث جديد على حالة حجزك في دورة ${course.courseName}.`;
      }

      // Create notification data
      const notificationData = {
        title: `تحديث حالة الحجز - ${course.courseName}`,
        message,
        type: 'booking_status' as any,
        priority: 'high' as any,
        recipientType: 'specific_students' as any,
        recipientIds: [booking.studentId], // 🎯 الطالب هو المستلم
        data: {
          bookingId: booking.id,
          courseId: booking.courseId,
          courseName: course.courseName,
          studentName: student.name,
          status: booking.status,
        },
        createdBy: booking.teacherId, // المدرس اللي غير الحالة
      };

      await this.notificationService.createAndSendNotification(
        notificationData
      );
    } catch (error) {
      console.error('❌ Error sending booking status notification:', error);
    }
  }
}
