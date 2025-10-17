"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherCourseBookingController = void 0;
const course_booking_model_1 = require("../../models/course-booking.model");
const teacher_subscription_model_1 = require("../../models/teacher-subscription.model");
const notification_service_1 = require("../../services/notification.service");
const course_booking_service_1 = require("../../services/teacher/course-booking.service");
const types_1 = require("../../types");
class TeacherCourseBookingController {
    static async getRemainingStudents(req, res) {
        try {
            const teacherId = req.user?.id;
            if (!teacherId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }
            const check = await teacher_subscription_model_1.TeacherSubscriptionModel.canAddStudent(teacherId);
            const remaining = Math.max((check.maxStudents || 0) - (check.currentStudents || 0), 0);
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
        }
        catch (error) {
            console.error('Error getting remaining students:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async getMyBookings(req, res) {
        try {
            const teacherId = req.user?.id;
            if (!teacherId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }
            const studyYear = req.query['studyYear'];
            if (!studyYear) {
                res.status(400).json({
                    success: false,
                    message: 'السنة الدراسية مطلوبة',
                    errors: ['السنة الدراسية مطلوبة'],
                });
                return;
            }
            const page = parseInt(req.query['page']) || 1;
            const limit = parseInt(req.query['limit']) || 10;
            let status = req.query['status'];
            if (!status || status === 'null' || status.trim() === '') {
                status = undefined;
            }
            const result = await course_booking_service_1.CourseBookingService.getTeacherBookings(teacherId, studyYear, page, limit, status);
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
        }
        catch (error) {
            console.error('Error getting teacher bookings:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم'],
            });
        }
    }
    static async getBookingById(req, res) {
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
            const booking = await course_booking_service_1.CourseBookingService.getBookingByIdWithDetails(id);
            if (!booking) {
                res.status(404).json({
                    success: false,
                    message: 'الحجز غير موجود',
                    errors: ['الحجز غير موجود'],
                });
                return;
            }
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
        }
        catch (error) {
            console.error('Error getting booking:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم'],
            });
        }
    }
    static async preApproveBooking(req, res) {
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
            const data = {
                status: types_1.BookingStatus.PRE_APPROVED,
                teacherResponse,
            };
            const booking = await course_booking_service_1.CourseBookingService.updateBookingStatus(id, teacherId, data);
            await _a.sendBookingStatusNotification(booking);
            res.status(200).json({
                success: true,
                message: 'تم إعطاء موافقة أولية للحجز',
                data: booking,
            });
        }
        catch (error) {
            console.error('Error pre-approving booking:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async confirmBooking(req, res) {
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
            const currentBooking = await course_booking_service_1.CourseBookingService.getBookingByIdWithDetails(id);
            if (!currentBooking) {
                res.status(404).json({ success: false, message: 'الحجز غير موجود' });
                return;
            }
            if (currentBooking.status !== types_1.BookingStatus.PRE_APPROVED) {
                res.status(400).json({
                    success: false,
                    message: 'يمكن تأكيد الحجز فقط بعد الموافقة الأولية',
                });
                return;
            }
            const data = {
                status: types_1.BookingStatus.CONFIRMED,
                teacherResponse,
                reservationPaid,
            };
            const booking = await course_booking_service_1.CourseBookingService.updateBookingStatus(id, teacherId, data);
            await _a.sendBookingStatusNotification(booking);
            res.status(200).json({
                success: true,
                message: 'تم تأكيد الحجز بنجاح',
                data: booking,
            });
        }
        catch (error) {
            const msg = error?.message || '';
            if (msg === 'لا يوجد اشتراك فعال للمعلم' ||
                msg === 'انتهت صلاحية الاشتراك' ||
                msg.includes('الباقة ممتلئة') ||
                msg.includes('لا يمكن تأكيد الحجز')) {
                res.status(400).json({
                    success: false,
                    message: msg || 'لا يمكن تأكيد الحجز بسبب قيود الاشتراك',
                    errors: [msg || 'يرجى تفعيل أو ترقية الاشتراك قبل تأكيد الحجز'],
                });
                return;
            }
            console.error('Error confirming booking:', error);
            res
                .status(500)
                .json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم'],
            });
        }
    }
    static async rejectBooking(req, res) {
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
            const data = {
                status: types_1.BookingStatus.REJECTED,
                rejectionReason,
                teacherResponse,
            };
            const booking = await course_booking_service_1.CourseBookingService.updateBookingStatus(id, teacherId, data);
            await _a.sendBookingStatusNotification(booking);
            res.status(200).json({
                success: true,
                message: 'تم رفض الحجز',
                data: booking,
            });
        }
        catch (error) {
            if (error.message === 'Booking not found or access denied') {
                res.status(404).json({
                    success: false,
                    message: 'الحجز غير موجود',
                    errors: ['الوصول مرفوض'],
                });
            }
            else {
                console.error('Error rejecting booking:', error);
                res.status(500).json({
                    success: false,
                    message: 'خطأ داخلي في الخادم',
                    errors: ['حدث خطأ في الخادم'],
                });
            }
        }
    }
    static async updateTeacherResponse(req, res) {
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
            const data = {
                teacherResponse,
            };
            const booking = await course_booking_service_1.CourseBookingService.updateBookingStatus(id, teacherId, data);
            await _a.sendBookingStatusNotification(booking);
            res.status(200).json({
                success: true,
                message: 'تم تحديث حالة الحجز',
                data: booking,
            });
        }
        catch (error) {
            if (error.message === 'Booking not found or access denied') {
                res.status(404).json({
                    success: false,
                    message: 'الحجز غير موجود',
                    errors: ['الوصول مرفوض'],
                });
            }
            else {
                console.error('Error updating teacher response:', error);
                res.status(500).json({
                    success: false,
                    message: 'خطأ داخلي في الخادم',
                    errors: ['حدث خطأ في الخادم'],
                });
            }
        }
    }
    static async deleteBooking(req, res) {
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
            await course_booking_service_1.CourseBookingService.deleteBooking(id, teacherId, 'teacher');
            res.status(200).json({
                success: true,
                message: 'تم حذف الحجز',
            });
        }
        catch (error) {
            if (error.message === 'Booking not found or access denied') {
                res.status(404).json({
                    success: false,
                    message: 'الحجز غير موجود',
                    errors: ['الوصول مرفوض'],
                });
            }
            else {
                console.error('Error deleting booking:', error);
                res.status(500).json({
                    success: false,
                    message: 'خطأ داخلي في الخادم',
                    errors: ['حدث خطأ في الخادم'],
                });
            }
        }
    }
    static async reactivateBooking(req, res) {
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
            const currentBooking = await course_booking_service_1.CourseBookingService.getBookingByIdWithDetails(id);
            if (!currentBooking) {
                res.status(404).json({
                    success: false,
                    message: 'الحجز غير موجود',
                    errors: ['الحجز غير موجود'],
                });
                return;
            }
            if (currentBooking.teacherId !== teacherId) {
                res.status(403).json({
                    success: false,
                    message: 'الوصول مرفوض',
                    errors: ['الوصول مرفوض'],
                });
                return;
            }
            if (currentBooking.status !== types_1.BookingStatus.REJECTED) {
                res.status(400).json({
                    success: false,
                    message: 'يمكن إعادة تفعيل الحجوزات المرفوضة فقط',
                    errors: ['يمكن إعادة تفعيل الحجوزات المرفوضة فقط'],
                });
                return;
            }
            const data = {
                status: types_1.BookingStatus.PRE_APPROVED,
                teacherResponse,
            };
            const booking = await course_booking_service_1.CourseBookingService.updateBookingStatus(id, teacherId, data);
            await _a.sendBookingStatusNotification(booking);
            res.status(200).json({
                success: true,
                message: 'تم إعادة تفعيل الحجز بنجاح',
                data: booking,
            });
        }
        catch (error) {
            console.error('Error reactivating booking:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم'],
            });
        }
    }
    static async getBookingStats(req, res) {
        try {
            const teacherId = req.user?.id;
            if (!teacherId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }
            const studyYear = req.query['studyYear'];
            if (!studyYear) {
                res.status(400).json({
                    success: false,
                    message: 'السنة الدراسية مطلوبة',
                    errors: ['السنة الدراسية مطلوبة'],
                });
                return;
            }
            const pendingCount = await course_booking_service_1.CourseBookingService.getPendingBookingsCount(teacherId, studyYear);
            res.status(200).json({
                success: true,
                message: 'تم استرجاع إحصائيات الحجز',
                data: {
                    pendingBookings: pendingCount,
                },
            });
        }
        catch (error) {
            console.error('Error getting booking statistics:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم'],
            });
        }
    }
    static async sendBookingStatusNotification(booking) {
        try {
            const bookingDetails = await course_booking_model_1.CourseBookingModel.findByIdWithDetails(booking.id);
            if (!bookingDetails) {
                console.error('Could not find booking details for notification');
                return;
            }
            const { course, student } = bookingDetails;
            let message = '';
            switch (booking.status) {
                case types_1.BookingStatus.PRE_APPROVED:
                    message = `تمت الموافقة الأولية على طلبك في دورة ${course.courseName}. نرجو حضورك في الموعد المحدد لتائكيد حجزك.`;
                    break;
                case types_1.BookingStatus.CONFIRMED:
                    message = `تم تأكيد حجزك في دورة ${course.courseName}. مرحبا بك.`;
                    break;
                case types_1.BookingStatus.APPROVED:
                    message = `تمت الموافقة النهائية على طلبك في دورة ${course.courseName}.`;
                    break;
                case types_1.BookingStatus.REJECTED:
                    message = `تم رفض طلبك في دورة ${course.courseName}.`;
                    break;
                case types_1.BookingStatus.CANCELLED:
                    message = `تم إلغاء حجزك في دورة ${course.courseName}.`;
                    break;
                default:
                    message = `تحديث جديد على حالة حجزك في دورة ${course.courseName}.`;
            }
            const notificationData = {
                title: `تحديث حالة الحجز - ${course.courseName}`,
                message,
                type: 'booking_status',
                priority: 'high',
                recipientType: 'specific_students',
                recipientIds: [booking.studentId],
                data: {
                    bookingId: booking.id,
                    courseId: booking.courseId,
                    courseName: course.courseName,
                    studentName: student.name,
                    status: booking.status,
                },
                createdBy: booking.teacherId,
            };
            await this.notificationService.createAndSendNotification(notificationData);
        }
        catch (error) {
            console.error('❌ Error sending booking status notification:', error);
        }
    }
}
exports.TeacherCourseBookingController = TeacherCourseBookingController;
_a = TeacherCourseBookingController;
(() => {
    const oneSignalConfig = {
        appId: process.env['ONESIGNAL_APP_ID'] || '',
        restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || '',
    };
    _a.notificationService = new notification_service_1.NotificationService(oneSignalConfig);
})();
//# sourceMappingURL=course-booking.controller.js.map