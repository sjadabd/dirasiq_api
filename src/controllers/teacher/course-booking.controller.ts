import type { Request, Response } from 'express';

import { CourseBookingModel } from '../../models/course-booking.model';
import { TeacherSubscriptionModel } from '../../models/teacher-subscription.model';
import { NotificationService } from '../../services/notification.service';
import { CourseBookingService } from '../../services/teacher/course-booking.service';
import { BookingStatus, type CourseBooking, type UpdateCourseBookingRequest } from '../../types';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';

// Errors thrown by CourseBookingService that map to known business-rule
// failures (capacity, subscription, state machine, ownership).
const SERVICE_BUSINESS_MESSAGES = [
  'لا يوجد اشتراك فعال للمعلم',
  'انتهت صلاحية الاشتراك',
];
const SERVICE_NOT_FOUND_MESSAGE = 'Booking not found or access denied';

const mapServiceError = (err: unknown): ApiError => {
  const message = err instanceof Error ? err.message : String(err ?? '');
  if (message === SERVICE_NOT_FOUND_MESSAGE) {
    return new ApiError(404, 'الحجز غير موجود أو الوصول مرفوض', ErrorCodes.NOT_FOUND);
  }
  if (
    SERVICE_BUSINESS_MESSAGES.includes(message) ||
    message.includes('الباقة ممتلئة') ||
    message.includes('لا يمكن تأكيد الحجز')
  ) {
    return new ApiError(400, message || 'لا يمكن تأكيد الحجز', ErrorCodes.BUSINESS_RULE);
  }
  // Unknown error → bubble to global error middleware as a 500.
  return new ApiError(500, 'خطأ داخلي في الخادم', ErrorCodes.INTERNAL_ERROR, undefined, {
    expected: false,
    cause: err,
  });
};

export class TeacherCourseBookingController {
  private static notificationService = new NotificationService({
    appId: process.env['ONESIGNAL_APP_ID'] || '',
    restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || '',
  });

  static async getRemainingStudents(req: Request, res: Response): Promise<void> {
    // Cache headers preserved from legacy behaviour — dashboards rely on
    // always-fresh capacity numbers when activating a booking.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.removeHeader('ETag');

    const teacherId = req.user.id as string;
    const check = await TeacherSubscriptionModel.canAddStudent(teacherId);
    const remaining = Math.max((check.maxStudents || 0) - (check.currentStudents || 0), 0);

    const message =
      !check.canAdd && check.maxStudents === 0
        ? check.message || 'لا يوجد اشتراك فعال للمعلم'
        : 'تم جلب سعة الاشتراك بنجاح';

    res.status(200).json(
      ok(
        {
          currentStudents: check.currentStudents,
          maxStudents: check.maxStudents,
          remaining,
          canAdd: !check.canAdd && check.maxStudents === 0 ? false : check.canAdd,
        },
        message
      )
    );
  }

  static async getMyBookings(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const query = req.query as unknown as {
      studyYear: string;
      page?: number;
      limit?: number;
      status?: string;
    };
    const { page, limit } = parsePagination(query);

    const result = await CourseBookingService.getTeacherBookings(
      teacherId,
      query.studyYear,
      page,
      limit,
      query.status as any
    );

    res
      .status(200)
      .json(
        paginated(
          result.bookings,
          buildPaginationMeta(result.total, page, limit),
          'تم استرجاع الحجوزات'
        )
      );
  }

  static async getBookingById(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;

    const booking = await CourseBookingService.getBookingByIdWithDetails(id);
    if (!booking) {
      throw new ApiError(404, 'الحجز غير موجود', ErrorCodes.NOT_FOUND);
    }
    if (booking.teacherId !== teacherId) {
      throw new ApiError(403, 'الوصول مرفوض', ErrorCodes.FORBIDDEN);
    }

    res.status(200).json(ok(booking, 'تم استرجاع الحجز'));
  }

  static async preApproveBooking(req: Request, res: Response): Promise<void> {
    await TeacherCourseBookingController.transitionStatus(req, res, {
      newStatus: BookingStatus.PRE_APPROVED,
      requireBody: 'teacherResponse',
      successMessage: 'تم إعطاء موافقة أولية للحجز',
    });
  }

  static async confirmBooking(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const { teacherResponse, reservationPaid } = req.body as {
      teacherResponse?: string;
      reservationPaid?: boolean;
    };

    // The pre-approval check belongs in the controller because the legacy
    // service uses a generic update path that doesn't enforce transition order.
    const current = await CourseBookingService.getBookingByIdWithDetails(id);
    if (!current) {
      throw new ApiError(404, 'الحجز غير موجود', ErrorCodes.NOT_FOUND);
    }
    if (current.teacherId !== teacherId) {
      throw new ApiError(403, 'الوصول مرفوض', ErrorCodes.FORBIDDEN);
    }
    if (current.status !== BookingStatus.PRE_APPROVED) {
      throw new ApiError(
        400,
        'يمكن تأكيد الحجز فقط بعد الموافقة الأولية',
        ErrorCodes.BUSINESS_RULE
      );
    }

    const data: UpdateCourseBookingRequest & { reservationPaid?: boolean } = {
      status: BookingStatus.CONFIRMED,
    };
    if (teacherResponse !== undefined) data.teacherResponse = teacherResponse;
    if (reservationPaid !== undefined) data.reservationPaid = reservationPaid;

    try {
      const booking = await CourseBookingService.updateBookingStatus(id, teacherId, data);
      await TeacherCourseBookingController.sendBookingStatusNotification(booking);
      res.status(200).json(ok(booking, 'تم تأكيد الحجز بنجاح'));
    } catch (err) {
      throw mapServiceError(err);
    }
  }

  static async rejectBooking(req: Request, res: Response): Promise<void> {
    await TeacherCourseBookingController.transitionStatus(req, res, {
      newStatus: BookingStatus.REJECTED,
      successMessage: 'تم رفض الحجز',
    });
  }

  static async updateTeacherResponse(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const { teacherResponse } = req.body as { teacherResponse: string };

    try {
      const booking = await CourseBookingService.updateBookingStatus(id, teacherId, {
        teacherResponse,
      });
      await TeacherCourseBookingController.sendBookingStatusNotification(booking);
      res.status(200).json(ok(booking, 'تم تحديث حالة الحجز'));
    } catch (err) {
      throw mapServiceError(err);
    }
  }

  static async deleteBooking(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;

    try {
      await CourseBookingService.deleteBooking(id, teacherId, 'teacher');
      res.status(200).json(ok(null, 'تم حذف الحجز'));
    } catch (err) {
      throw mapServiceError(err);
    }
  }

  static async reactivateBooking(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const { teacherResponse } = req.body as { teacherResponse?: string };

    const current = await CourseBookingService.getBookingByIdWithDetails(id);
    if (!current) {
      throw new ApiError(404, 'الحجز غير موجود', ErrorCodes.NOT_FOUND);
    }
    if (current.teacherId !== teacherId) {
      throw new ApiError(403, 'الوصول مرفوض', ErrorCodes.FORBIDDEN);
    }
    if (current.status !== BookingStatus.REJECTED) {
      throw new ApiError(
        400,
        'يمكن إعادة تفعيل الحجوزات المرفوضة فقط',
        ErrorCodes.BUSINESS_RULE
      );
    }

    const data: UpdateCourseBookingRequest = { status: BookingStatus.PRE_APPROVED };
    if (teacherResponse !== undefined) data.teacherResponse = teacherResponse;

    try {
      const booking = await CourseBookingService.updateBookingStatus(id, teacherId, data);
      await TeacherCourseBookingController.sendBookingStatusNotification(booking);
      res.status(200).json(ok(booking, 'تم إعادة تفعيل الحجز بنجاح'));
    } catch (err) {
      throw mapServiceError(err);
    }
  }

  static async getBookingStats(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { studyYear } = req.query as { studyYear: string };
    const pending = await CourseBookingService.getPendingBookingsCount(teacherId, studyYear);
    res.status(200).json(ok({ pendingBookings: pending }, 'تم استرجاع إحصائيات الحجز'));
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private static async transitionStatus(
    req: Request,
    res: Response,
    config: {
      newStatus: BookingStatus;
      successMessage: string;
      requireBody?: 'teacherResponse';
    }
  ): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const body = (req.body as {
      teacherResponse?: string;
      rejectionReason?: string;
    }) || {};

    const data: UpdateCourseBookingRequest = { status: config.newStatus };
    if (body.teacherResponse !== undefined) data.teacherResponse = body.teacherResponse;
    if (body.rejectionReason !== undefined) data.rejectionReason = body.rejectionReason;

    try {
      const booking = await CourseBookingService.updateBookingStatus(id, teacherId, data);
      await TeacherCourseBookingController.sendBookingStatusNotification(booking);
      res.status(200).json(ok(booking, config.successMessage));
    } catch (err) {
      throw mapServiceError(err);
    }
  }

  private static async sendBookingStatusNotification(booking: CourseBooking): Promise<void> {
    try {
      const details = await CourseBookingModel.findByIdWithDetails(booking.id);
      if (!details) return;

      const { course, student } = details;
      const courseName = course.courseName;

      const messageByStatus: Partial<Record<BookingStatus, string>> = {
        [BookingStatus.PRE_APPROVED]: `تمت الموافقة الأولية على طلبك في دورة ${courseName}. نرجو حضورك في الموعد المحدد لتائكيد حجزك.`,
        [BookingStatus.CONFIRMED]: `تم تأكيد حجزك في دورة ${courseName}. مرحبا بك.`,
        [BookingStatus.APPROVED]: `تمت الموافقة النهائية على طلبك في دورة ${courseName}.`,
        [BookingStatus.REJECTED]: `تم رفض طلبك في دورة ${courseName}.`,
        [BookingStatus.CANCELLED]: `تم إلغاء حجزك في دورة ${courseName}.`,
      };
      const message = messageByStatus[booking.status] || `تحديث جديد على حالة حجزك في دورة ${courseName}.`;

      await TeacherCourseBookingController.notificationService.createAndSendNotification({
        title: `تحديث حالة الحجز - ${courseName}`,
        message,
        type: 'booking_status' as any,
        priority: 'high' as any,
        recipientType: 'specific_students' as any,
        recipientIds: [booking.studentId],
        data: {
          bookingId: booking.id,
          courseId: booking.courseId,
          courseName,
          studentName: student.name,
          status: booking.status,
        },
        createdBy: booking.teacherId,
      });
    } catch (err) {
      // Notifications are best-effort; never let a notification failure mask
      // the successful booking state change.
      const log = (booking as { id?: string }).id;
      // eslint-disable-next-line no-console -- pre-Phase-1.C
      console.warn('Booking status notification failed', { bookingId: log, err });
    }
  }
}
