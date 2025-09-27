import { CourseBookingService } from '@/services/teacher/course-booking.service';
import { CreateCourseBookingRequest, CourseBookingWithDetails } from '@/types';
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
          message: 'معرف الدورة مطلوب',
          errors: ['معرف الدورة مطلوب']
        });
        return;
      }

      const booking = await CourseBookingService.createBooking(studentId, data);

      res.status(201).json({
        success: true,
        message: 'تم إنشاء الحجز',
        data: booking
      });
    } catch (error: any) {
      if (error.message === 'Course not found') {
        res.status(404).json({
          success: false,
          message: 'الدورة غير موجودة',
          errors: ['الدورة غير موجودة']
        });
      } else if (error.message === 'Booking already exists for this course') {
        res.status(409).json({
          success: false,
          message: 'يوجد حجز موجود بالفعل',
          errors: ['يوجد حجز موجود بالفعل'],
          suggestion: 'يمكنك عرض الحجز الموجود أو إنشاء حجز جديد',
          action: 'عرض الحجز الموجود',
          details: 'تفاصيل الحجز الموجود'
        });
      } else if (error.code === '23505' && error.constraint === 'unique_student_course_booking') {
        res.status(409).json({
          success: false,
          message: 'يوجد حجز موجود بالفعل',
          errors: ['يوجد حجز موجود بالفعل'],
          suggestion: 'يمكنك عرض الحجز الموجود أو إنشاء حجز جديد',
          action: 'عرض الحجز الموجود',
          details: 'تفاصيل الحجز الموجود'
        });
      } else {
        console.error('Error creating course booking:', error);
        res.status(500).json({
          success: false,
          message: 'خطأ داخلي في الخادم',
          errors: ['حدث خطأ في الخادم']
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
          message: 'السنة الدراسية مطلوبة',
          errors: ['السنة الدراسية مطلوبة']
        });
        return;
      }

      const page = parseInt(req.query['page'] as string) || 1;
      const limit = parseInt(req.query['limit'] as string) || 10;
      const status = req.query['status'] as any;

      const result = await CourseBookingService.getStudentBookings(studentId, studyYear, page, limit, status);

      // Return only the requested fields
      const enhancedBookings = (result.bookings as CourseBookingWithDetails[]).map((booking) => ({
        id: booking.id,
        studyYear: booking.studyYear,
        status: booking.status,
        bookingDate: booking.bookingDate,
        approvedAt: booking.approvedAt,
        rejectedAt: booking.rejectedAt,
        cancelledAt: booking.cancelledAt,
        rejectionReason: booking.rejectionReason,
        cancellationReason: booking.cancellationReason,
        studentMessage: booking.studentMessage,
        teacherResponse: booking.teacherResponse,
        reactivatedAt: booking.reactivatedAt,
        student_name: booking.student?.name,
        courseName: booking.course?.courseName,
        courseImages: booking.course?.courseImages,
        teacher_name: booking.teacher?.name,
        price: booking.course?.price
      }));


      res.status(200).json({
        success: true,
        message: 'تم استرجاع الحجز بنجاح',
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
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
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
          message: 'التحقق مطلوب',
          errors: ['التحقق مطلوب']
        });
        return;
      }

      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          message: 'معرف الحجز مطلوب',
          errors: ['معرف الحجز مطلوب']
        });
        return;
      }
      // Get booking with details (course and teacher info)
      const booking = await CourseBookingService.getBookingByIdWithDetails(id);

      if (!booking) {
        res.status(404).json({
          success: false,
          message: 'الحجز غير موجود',
          errors: ['الحجز غير موجود']
        });
        return;
      }

      // Check if the booking belongs to the current student
      if (booking.studentId !== studentId) {
        res.status(403).json({
          success: false,
          message: 'لا يوجد حجز موجود',
          errors: ['لا يوجد حجز موجود']
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'تم استرجاع الحجز بنجاح',
        data: booking
      });
    } catch (error: any) {
      console.error('Error getting booking:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
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
          message: 'التحقق مطلوب',
          errors: ['التحقق مطلوب']
        });
        return;
      }

      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          message: 'معرف الحجز مطلوب',
          errors: ['معرف الحجز مطلوب']
        });
        return;
      }
      const { reason } = req.body;

      const booking = await CourseBookingService.cancelBooking(id, studentId, reason);

      res.status(200).json({
        success: true,
        message: 'تم إلغاء الحجز',
        data: booking
      });
    } catch (error: any) {
      if (error.message === 'Booking not found or access denied') {
        res.status(404).json({
          success: false,
          message: 'الحجز غير موجود',
          errors: ['الحجز غير موجود']
        });
      } else {
        console.error('Error cancelling booking:', error);
        res.status(500).json({
          success: false,
          message: 'خطأ داخلي في الخادم',
          errors: ['حدث خطأ في الخادم']
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
          message: 'تم إعادة تفعيل الحجز',
          data: booking,
          warning: {
            message: 'الدورة ختمت',
            note: 'يمكنك التواصل مع المعلم للحصول على الدورة',
            action: 'التواصل مع المعلم'
          }
        });
      } else {
        res.status(200).json({
          success: true,
          message: 'تم إعادة تفعيل الحجز',
          data: booking
        });
      }
    } catch (error: any) {
      if (error.message === 'Booking not found') {
        res.status(404).json({
          success: false,
          message: 'الحجز غير موجود',
          errors: ['الحجز غير موجود']
        });
      } else if (error.message === 'Access denied - booking does not belong to you') {
        res.status(403).json({
          success: false,
          message: 'لا يوجد حجز موجود',
          errors: ['لا يوجد حجز موجود']
        });
      } else if (error.message === 'Booking is already active and pending') {
        res.status(400).json({
          success: false,
          message: 'الحجز مفعل ومعلق',
          errors: ['الحجز مفعل ومعلق'],
          suggestion: 'يمكنك التحقق من حالة الحجز',
          action: 'التحقق من حالة الحجز'
        });
      } else if (error.message === 'Booking is already approved and active') {
        res.status(400).json({
          success: false,
          message: 'الحجز مفعل ومعلق',
          errors: ['الحجز مفعل ومعلق'],
          suggestion: 'يمكنك التحقق من حالة الحجز',
          action: 'التحقق من حالة الحجز'
        });
      } else if (error.message === 'Cannot reactivate rejected bookings. Please create a new booking instead.') {
        res.status(400).json({
          success: false,
          message: 'لا يمكن إعادة تفعيل الحجز المرفوض',
          errors: ['لا يمكن إعادة تفعيل الحجز المرفوض'],
          suggestion: 'يمكنك إنشاء حجز جديد',
          action: 'إنشاء حجز جديد'
        });
      } else if (error.message.includes('Cannot reactivate booking with status:')) {
        res.status(400).json({
          success: false,
          message: 'حالة الحجز غير مفعلة',
          errors: ['حالة الحجز غير مفعلة'],
          suggestion: 'يمكنك إنشاء حجز جديد',
          currentStatus: error.message.split(':')[1]?.trim(),
          action: 'التحقق من حالة الحجز'
        });
      } else if (error.message === 'Cannot reactivate bookings cancelled by teacher') {
        res.status(403).json({
          success: false,
          message: 'لا يمكن إعادة تفعيل الحجز الملغي من قبل المعلم',
          errors: ['لا يمكن إعادة تفعيل الحجز الملغي من قبل المعلم']
        });
      } else if (error.message === 'Course is no longer available') {
        res.status(400).json({
          success: false,
          message: 'الدورة غير موجودة',
          errors: ['الدورة غير موجودة']
        });
      } else if (error.message === 'لا يوجد اشتراك فعال للمعلم') {
        // لا يوجد اشتراك فعّال → استجابة واضحة للمستخدم
        res.status(400).json({
          success: false,
          message: 'لا يوجد اشتراك فعال للمعلم',
          errors: ['لا يوجد اشتراك فعال للمعلم'],
          suggestion: 'يرجى انتظار تفعيل اشتراك المعلم أو التواصل معه لتفعيل باقته'
        });
      } else if (error.message === 'انتهت صلاحية الاشتراك') {
        // الاشتراك منتهي الصلاحية
        res.status(400).json({
          success: false,
          message: 'انتهت صلاحية اشتراك المعلم',
          errors: ['انتهت صلاحية الاشتراك'],
          suggestion: 'يرجى انتظار تجديد اشتراك المعلم'
        });
      } else if (error.message === 'الباقة ممتلئة. لا يمكنك قبول طلاب إضافيين') {
        // السعة ممتلئة
        res.status(400).json({
          success: false,
          message: 'لا يمكن إعادة التفعيل لأن باقة المعلم ممتلئة',
          errors: ['الباقة ممتلئة. لا يمكنك قبول طلاب إضافيين'],
          suggestion: 'يرجى انتظار توفر مقعد أو التواصل مع المعلم لترقية الباقة'
        });
      } else if (error.message === 'Course has already ended') {
        res.status(400).json({
          success: false,
          message: 'الدورة ختمت',
          errors: ['الدورة ختمت'],
          suggestion: 'يمكنك البحث عن دورات جديدة',
          details: 'تفاصيل الدورة الختمتة'
        });
      } else {
        console.error('Error reactivating booking:', error);
        res.status(500).json({
          success: false,
          message: 'خطأ داخلي في الخادم',
          errors: ['حدث خطأ في الخادم']
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
          message: 'التحقق مطلوب',
          errors: ['التحقق مطلوب']
        });
        return;
      }

      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          message: 'معرف الحجز مطلوب',
          errors: ['معرف الحجز مطلوب']
        });
        return;
      }

      await CourseBookingService.deleteBooking(id, studentId, 'student');

      res.status(200).json({
        success: true,
        message: 'تم حذف الحجز'
      });
    } catch (error: any) {
      if (error.message === 'Booking not found or access denied') {
        res.status(404).json({
          success: false,
          message: 'الحجز غير موجود',
          errors: ['الحجز غير موجود']
        });
      } else {
        console.error('Error deleting booking:', error);
        res.status(500).json({
          success: false,
          message: 'خطأ داخلي في الخادم',
          errors: ['حدث خطأ في الخادم']
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
          message: 'التحقق مطلوب',
          errors: ['التحقق مطلوب']
        });
        return;
      }

      const studyYear = req.query['studyYear'] as string;
      if (!studyYear) {
        res.status(400).json({
          success: false,
          message: 'السنة الدراسية مطلوبة',
          errors: ['السنة الدراسية مطلوبة']
        });
        return;
      }

      const approvedCount = await CourseBookingService.getApprovedBookingsCount(studentId, studyYear);

      res.status(200).json({
        success: true,
        message: 'تم استرجاع إحصائيات الحجز',
        data: {
          approvedBookings: approvedCount
        }
      });
    } catch (error: any) {
      console.error('Error getting booking statistics:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }
}
