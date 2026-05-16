import type { Request, Response } from 'express';

import { SessionModel } from '../../models/session.model';
import { AcademicYearService } from '../../services/super_admin/academic-year.service';
import { CourseBookingService } from '../../services/teacher/course-booking.service';
import { BookingStatus, type CourseBookingWithDetails } from '../../types';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';

export class StudentEnrollmentController {
  // GET /api/student/enrollments
  static async getMyEnrolledCourses(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;

    const activeAcademicYear = (await AcademicYearService.getActive())?.academicYear;
    if (!activeAcademicYear?.year) {
      throw new ApiError(400, 'لا توجد سنة دراسية مفعلة', ErrorCodes.BUSINESS_RULE);
    }

    const { page, limit } = parsePagination(req.query);
    const { bookings, total } = await CourseBookingService.getStudentBookings(
      studentId,
      activeAcademicYear.year,
      page,
      limit,
      BookingStatus.CONFIRMED
    );

    const data = (bookings as CourseBookingWithDetails[]).map((b) => ({
      bookingId: b.id,
      status: b.status,
      studyYear: b.studyYear,
      bookingDate: b.bookingDate,
      course: {
        id: b.course?.id,
        name: b.course?.courseName,
        images: b.course?.courseImages,
        description: b.course?.description,
        startDate: b.course?.startDate,
        endDate: b.course?.endDate,
        price: b.course?.price,
        seatsCount: b.course?.seatsCount,
      },
      teacher: { id: b.teacher?.id, name: b.teacher?.name },
    }));

    res
      .status(200)
      .json(paginated(data, buildPaginationMeta(total, page, limit), 'تم جلب الدورات المسجل بها'));
  }

  // GET /api/student/enrollments/schedule
  static async getWeeklySchedule(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const query = req.query as { weekStart?: string };
    const weekStart = query.weekStart || new Date().toISOString().substring(0, 10);
    const schedule = await SessionModel.getStudentWeeklySchedule(studentId, weekStart);
    res.status(200).json(ok(schedule, 'تم جلب جدول الأسبوع'));
  }

  // GET /api/student/enrollments/schedule/weekly — alias
  static async getWeeklyScheduleComprehensive(req: Request, res: Response): Promise<void> {
    await StudentEnrollmentController.getWeeklySchedule(req, res);
  }

  // GET /api/student/enrollments/schedule/weekly/by-course/:courseId
  static async getWeeklyScheduleByCourse(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const courseId = req.params['courseId'] as string;
    const query = req.query as { weekStart?: string };
    const weekStart = query.weekStart || new Date().toISOString().substring(0, 10);

    const schedule = await SessionModel.getStudentWeeklySchedule(studentId, weekStart);
    const filtered = schedule.filter((s: any) => String(s.courseId) === String(courseId));
    res.status(200).json(ok(filtered, 'تم جلب جدول الأسبوع للكورس المحدد'));
  }
}
