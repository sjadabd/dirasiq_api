import type { Request, Response } from 'express';

import { CourseBookingService } from '../../services/teacher/course-booking.service';
import { type CourseBookingWithDetails, type CreateCourseBookingRequest } from '../../types';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';

/**
 * The legacy student-booking flow surfaced rich error metadata (`suggestion`,
 * `action`, `currentStatus`, etc.) above and beyond `message`/`errors`. The
 * canonical envelope can carry these via the ApiError `details` field, which
 * the error middleware leaves untouched on the wire. Encoding the legacy hints
 * here preserves the Flutter UX without inventing a new shape.
 */
const mapCreateBookingError = (err: any): ApiError => {
  const message = err?.message ?? '';
  if (message === 'Course not found') {
    return new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
  }
  if (
    message === 'Student grade not eligible for this course' ||
    err?.code === 'STUDENT_GRADE_MISMATCH'
  ) {
    return new ApiError(
      400,
      'لا يمكنك الحجز في هذه الدورة لأنها ليست للمرحلة الدراسية الخاصة بك',
      ErrorCodes.BUSINESS_RULE
    );
  }
  if (
    message === 'Booking already exists for this course' ||
    (err?.code === '23505' && err?.constraint === 'unique_student_course_booking')
  ) {
    return new ApiError(409, 'يوجد حجز موجود بالفعل', ErrorCodes.ALREADY_EXISTS, {
      suggestion: 'يمكنك عرض الحجز الموجود أو إنشاء حجز جديد',
      action: 'عرض الحجز الموجود',
    });
  }
  return new ApiError(500, 'خطأ داخلي في الخادم', ErrorCodes.INTERNAL_ERROR, undefined, {
    expected: false,
    cause: err,
  });
};

const mapReactivateError = (err: any): ApiError => {
  const message: string = err?.message ?? '';

  if (message === 'Booking not found') {
    return new ApiError(404, 'الحجز غير موجود', ErrorCodes.NOT_FOUND);
  }
  if (message === 'Access denied - booking does not belong to you') {
    return new ApiError(403, 'الحجز لا يعود إليك', ErrorCodes.FORBIDDEN);
  }
  if (message === 'Booking is already active and pending' || message === 'Booking is already approved and active') {
    return new ApiError(400, 'الحجز مفعل ومعلق', ErrorCodes.BUSINESS_RULE, {
      suggestion: 'يمكنك التحقق من حالة الحجز',
      action: 'التحقق من حالة الحجز',
    });
  }
  if (message === 'Cannot reactivate rejected bookings. Please create a new booking instead.') {
    return new ApiError(400, 'لا يمكن إعادة تفعيل الحجز المرفوض', ErrorCodes.BUSINESS_RULE, {
      suggestion: 'يمكنك إنشاء حجز جديد',
      action: 'إنشاء حجز جديد',
    });
  }
  if (message.startsWith('Cannot reactivate booking with status:')) {
    return new ApiError(400, 'حالة الحجز غير مفعلة', ErrorCodes.BUSINESS_RULE, {
      currentStatus: message.split(':')[1]?.trim(),
      suggestion: 'يمكنك إنشاء حجز جديد',
      action: 'التحقق من حالة الحجز',
    });
  }
  if (message === 'Cannot reactivate bookings cancelled by teacher') {
    return new ApiError(
      403,
      'لا يمكن إعادة تفعيل الحجز الملغي من قبل المعلم',
      ErrorCodes.FORBIDDEN
    );
  }
  if (message === 'Course is no longer available') {
    return new ApiError(400, 'الدورة غير موجودة', ErrorCodes.BUSINESS_RULE);
  }
  if (message === 'Course has already ended') {
    return new ApiError(400, 'الدورة ختمت', ErrorCodes.BUSINESS_RULE, {
      suggestion: 'يمكنك البحث عن دورات جديدة',
    });
  }
  if (message === 'لا يوجد اشتراك فعال للمعلم') {
    return new ApiError(400, message, ErrorCodes.BUSINESS_RULE, {
      suggestion: 'يرجى انتظار تفعيل اشتراك المعلم أو التواصل معه لتفعيل باقته',
    });
  }
  if (message === 'انتهت صلاحية الاشتراك') {
    return new ApiError(400, 'انتهت صلاحية اشتراك المعلم', ErrorCodes.BUSINESS_RULE, {
      suggestion: 'يرجى انتظار تجديد اشتراك المعلم',
    });
  }
  if (message === 'الباقة ممتلئة. لا يمكنك قبول طلاب إضافيين') {
    return new ApiError(
      400,
      'لا يمكن إعادة التفعيل لأن باقة المعلم ممتلئة',
      ErrorCodes.CAPACITY_EXCEEDED,
      { suggestion: 'يرجى انتظار توفر مقعد أو التواصل مع المعلم لترقية الباقة' }
    );
  }
  return new ApiError(500, 'خطأ داخلي في الخادم', ErrorCodes.INTERNAL_ERROR, undefined, {
    expected: false,
    cause: err,
  });
};

export class StudentCourseBookingController {
  // POST /api/student/course-bookings
  static async createBooking(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const data = req.body as CreateCourseBookingRequest;
    try {
      const booking = await CourseBookingService.createBooking(studentId, data);
      res.status(201).json(ok(booking, 'تم إنشاء الحجز'));
    } catch (err) {
      throw mapCreateBookingError(err);
    }
  }

  // GET /api/student/course-bookings
  static async getMyBookings(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const query = req.query as unknown as {
      studyYear: string;
      page?: number;
      limit?: number;
      status?: string;
    };
    const { page, limit } = parsePagination(query);

    const result = await CourseBookingService.getStudentBookings(
      studentId,
      query.studyYear,
      page,
      limit,
      query.status as any
    );

    // Slim shape preserved from the legacy controller — the Flutter list
    // screen depends on these exact field names.
    const enhanced = (result.bookings as CourseBookingWithDetails[]).map((b) => ({
      id: b.id,
      studyYear: b.studyYear,
      status: b.status,
      bookingDate: b.bookingDate,
      approvedAt: b.approvedAt,
      rejectedAt: b.rejectedAt,
      cancelledAt: b.cancelledAt,
      rejectionReason: b.rejectionReason,
      cancellationReason: b.cancellationReason,
      studentMessage: b.studentMessage,
      teacherResponse: b.teacherResponse,
      reactivatedAt: b.reactivatedAt,
      student_name: b.student?.name,
      courseName: b.course?.courseName,
      courseImages: b.course?.courseImages,
      teacher_name: b.teacher?.name,
      price: b.course?.price,
    }));

    res
      .status(200)
      .json(paginated(enhanced, buildPaginationMeta(result.total, page, limit), 'تم استرجاع الحجز'));
  }

  // GET /api/student/course-bookings/:id
  static async getBookingById(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const id = req.params['id'] as string;
    const booking = await CourseBookingService.getBookingByIdWithDetails(id);
    if (!booking) {
      throw new ApiError(404, 'الحجز غير موجود', ErrorCodes.NOT_FOUND);
    }
    if (booking.studentId !== studentId) {
      // Return 404 instead of 403 to avoid leaking the existence of someone
      // else's booking. Matches legacy behaviour ("لا يوجد حجز موجود").
      throw new ApiError(404, 'لا يوجد حجز موجود', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(ok(booking, 'تم استرجاع الحجز'));
  }

  // PATCH /api/student/course-bookings/:id/cancel
  static async cancelBooking(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const id = req.params['id'] as string;
    const { reason } = req.body as { reason?: string };
    try {
      const booking = await CourseBookingService.cancelBooking(id, studentId, reason);
      res.status(200).json(ok(booking, 'تم إلغاء الحجز'));
    } catch (err: any) {
      if (err?.message === 'Booking not found or access denied') {
        throw new ApiError(404, 'الحجز غير موجود', ErrorCodes.NOT_FOUND);
      }
      throw new ApiError(500, 'خطأ داخلي في الخادم', ErrorCodes.INTERNAL_ERROR, undefined, {
        expected: false,
        cause: err,
      });
    }
  }

  // PATCH /api/student/course-bookings/:id/reactivate
  static async reactivateBooking(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const id = req.params['id'] as string;
    try {
      const booking = await CourseBookingService.reactivateBooking(id, studentId);
      // Legacy contract optionally surfaced a course-ended warning. Carry it
      // under meta so dashboards / Flutter that already inspect this keep
      // working.
      if ((booking as any).courseEndedWarning) {
        res.status(200).json(
          ok(booking, 'تم إعادة تفعيل الحجز', {
            warning: {
              message: 'الدورة ختمت',
              note: 'يمكنك التواصل مع المعلم للحصول على الدورة',
              action: 'التواصل مع المعلم',
            },
          })
        );
        return;
      }
      res.status(200).json(ok(booking, 'تم إعادة تفعيل الحجز'));
    } catch (err) {
      throw mapReactivateError(err);
    }
  }

  // DELETE /api/student/course-bookings/:id
  static async deleteBooking(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const id = req.params['id'] as string;
    try {
      await CourseBookingService.deleteBooking(id, studentId, 'student');
      res.status(200).json(ok(null, 'تم حذف الحجز'));
    } catch (err: any) {
      if (err?.message === 'Booking not found or access denied') {
        throw new ApiError(404, 'الحجز غير موجود', ErrorCodes.NOT_FOUND);
      }
      throw new ApiError(500, 'خطأ داخلي في الخادم', ErrorCodes.INTERNAL_ERROR, undefined, {
        expected: false,
        cause: err,
      });
    }
  }

  // GET /api/student/course-bookings/stats/summary
  static async getBookingStats(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const { studyYear } = req.query as { studyYear: string };
    const approvedCount = await CourseBookingService.getApprovedBookingsCount(studentId, studyYear);
    res.status(200).json(ok({ approvedBookings: approvedCount }, 'تم استرجاع إحصائيات الحجز'));
  }
}
