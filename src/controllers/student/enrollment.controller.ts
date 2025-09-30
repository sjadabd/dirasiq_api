import { AcademicYearService } from '@/services/super_admin/academic-year.service';
import { CourseBookingService } from '@/services/teacher/course-booking.service';
import { BookingStatus, CourseBookingWithDetails } from '@/types';
import { Request, Response } from 'express';
import { SessionModel } from '@/models/session.model';

export class StudentEnrollmentController {
  // GET /api/student/enrollments
  static async getMyEnrolledCourses(req: Request, res: Response): Promise<void> {
    try {
      const studentId = req.user?.id;
      if (!studentId) {
        res.status(401).json({ success: false, message: 'التحقق مطلوب', errors: ['التحقق مطلوب'] });
        return;
      }

      // Get active academic year
      const academicYearResponse = await AcademicYearService.getActive();
      const activeAcademicYear = academicYearResponse.success ? academicYearResponse.data?.academicYear : null;
      if (!activeAcademicYear?.year) {
        res.status(400).json({ success: false, message: 'لا توجد سنة دراسية مفعلة', errors: ['لا توجد سنة دراسية مفعلة'] });
        return;
      }

      const page = parseInt((req.query['page'] as string) || '1', 10);
      const limit = parseInt((req.query['limit'] as string) || '10', 10);

      // Fetch confirmed bookings (enrolled courses) for the active year
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
          seatsCount: b.course?.seatsCount
        },
        teacher: {
          id: b.teacher?.id,
          name: b.teacher?.name,
        }
      }));

      res.status(200).json({
        success: true,
        message: 'تم جلب الدورات المسجل بها بنجاح',
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Error getting enrolled courses:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
    }
  }

  // GET /api/student/enrollments/schedule
  static async getWeeklySchedule(req: Request, res: Response): Promise<void> {
    try {
      const studentId = req.user?.id;
      if (!studentId) {
        res.status(401).json({ success: false, message: 'التحقق مطلوب', errors: ['التحقق مطلوب'] });
        return;
      }

      const weekStart = (req.query['weekStart'] as string) || new Date().toISOString().substring(0, 10);
      const schedule = await SessionModel.getStudentWeeklySchedule(studentId, weekStart);

      res.status(200).json({
        success: true,
        message: 'تم جلب جدول الأسبوع بنجاح',
        data: schedule
      });
    } catch (error) {
      console.error('Error getting weekly schedule:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
    }
  }

  // GET /api/student/enrollments/schedule/weekly
  // Alias that returns the comprehensive weekly schedule (same as getWeeklySchedule)
  static async getWeeklyScheduleComprehensive(req: Request, res: Response): Promise<void> {
    return await this.getWeeklySchedule(req, res);
  }

  // GET /api/student/enrollments/schedule/weekly/by-course/:courseId
  static async getWeeklyScheduleByCourse(req: Request<{ courseId: string }>, res: Response): Promise<void> {
    try {
      const studentId = req.user?.id;
      if (!studentId) {
        res.status(401).json({ success: false, message: 'التحقق مطلوب', errors: ['التحقق مطلوب'] });
        return;
      }

      const courseId = req.params['courseId'];
      if (!courseId) {
        res.status(400).json({ success: false, message: 'بيانات ناقصة', errors: ['courseId مطلوب'] });
        return;
      }

      const weekStart = (req.query['weekStart'] as string) || new Date().toISOString().substring(0, 10);
      const schedule = await SessionModel.getStudentWeeklySchedule(studentId, weekStart);
      const filtered = schedule.filter((s: any) => String(s.courseId) === String(courseId));

      res.status(200).json({
        success: true,
        message: 'تم جلب جدول الأسبوع للكورس المحدد بنجاح',
        data: filtered
      });
    } catch (error) {
      console.error('Error getting weekly schedule by course:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
    }
  }
}
