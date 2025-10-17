"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentEnrollmentController = void 0;
const session_model_1 = require("../../models/session.model");
const academic_year_service_1 = require("../../services/super_admin/academic-year.service");
const course_booking_service_1 = require("../../services/teacher/course-booking.service");
const types_1 = require("../../types");
class StudentEnrollmentController {
    static async getMyEnrolledCourses(req, res) {
        try {
            const studentId = req.user?.id;
            if (!studentId) {
                res.status(401).json({ success: false, message: 'التحقق مطلوب', errors: ['التحقق مطلوب'] });
                return;
            }
            const academicYearResponse = await academic_year_service_1.AcademicYearService.getActive();
            const activeAcademicYear = academicYearResponse.success ? academicYearResponse.data?.academicYear : null;
            if (!activeAcademicYear?.year) {
                res.status(400).json({ success: false, message: 'لا توجد سنة دراسية مفعلة', errors: ['لا توجد سنة دراسية مفعلة'] });
                return;
            }
            const page = parseInt(req.query['page'] || '1', 10);
            const limit = parseInt(req.query['limit'] || '10', 10);
            const { bookings, total } = await course_booking_service_1.CourseBookingService.getStudentBookings(studentId, activeAcademicYear.year, page, limit, types_1.BookingStatus.CONFIRMED);
            const data = bookings.map((b) => ({
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
        }
        catch (error) {
            console.error('Error getting enrolled courses:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
        }
    }
    static async getWeeklySchedule(req, res) {
        try {
            const studentId = req.user?.id;
            if (!studentId) {
                res.status(401).json({ success: false, message: 'التحقق مطلوب', errors: ['التحقق مطلوب'] });
                return;
            }
            const weekStart = req.query['weekStart'] || new Date().toISOString().substring(0, 10);
            const schedule = await session_model_1.SessionModel.getStudentWeeklySchedule(studentId, weekStart);
            res.status(200).json({
                success: true,
                message: 'تم جلب جدول الأسبوع بنجاح',
                data: schedule
            });
        }
        catch (error) {
            console.error('Error getting weekly schedule:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
        }
    }
    static async getWeeklyScheduleComprehensive(req, res) {
        return await this.getWeeklySchedule(req, res);
    }
    static async getWeeklyScheduleByCourse(req, res) {
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
            const weekStart = req.query['weekStart'] || new Date().toISOString().substring(0, 10);
            const schedule = await session_model_1.SessionModel.getStudentWeeklySchedule(studentId, weekStart);
            const filtered = schedule.filter((s) => String(s.courseId) === String(courseId));
            res.status(200).json({
                success: true,
                message: 'تم جلب جدول الأسبوع للكورس المحدد بنجاح',
                data: filtered
            });
        }
        catch (error) {
            console.error('Error getting weekly schedule by course:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
        }
    }
}
exports.StudentEnrollmentController = StudentEnrollmentController;
//# sourceMappingURL=enrollment.controller.js.map