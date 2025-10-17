"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CourseBookingService = void 0;
const course_booking_model_1 = require("../../models/course-booking.model");
const notification_service_1 = require("../../services/notification.service");
const types_1 = require("../../types");
class CourseBookingService {
    static async createBooking(studentId, data) {
        try {
            const booking = await course_booking_model_1.CourseBookingModel.create(studentId, data);
            await this.sendNewBookingNotification(booking);
            return booking;
        }
        catch (error) {
            throw error;
        }
    }
    static async getBookingById(id) {
        try {
            return await course_booking_model_1.CourseBookingModel.findById(id);
        }
        catch (error) {
            throw error;
        }
    }
    static async getBookingByIdWithDetails(id) {
        try {
            return await course_booking_model_1.CourseBookingModel.findByIdWithDetails(id);
        }
        catch (error) {
            throw error;
        }
    }
    static async getStudentBookings(studentId, studyYear, page = 1, limit = 10, status, excludeStatus) {
        try {
            return await course_booking_model_1.CourseBookingModel.findAllByStudent(studentId, studyYear, page, limit, status, excludeStatus);
        }
        catch (error) {
            throw error;
        }
    }
    static async getTeacherBookings(teacherId, studyYear, page = 1, limit = 10, status) {
        try {
            return await course_booking_model_1.CourseBookingModel.findAllByTeacher(teacherId, studyYear, page, limit, status);
        }
        catch (error) {
            throw error;
        }
    }
    static async updateBookingStatus(id, teacherId, data) {
        try {
            return await course_booking_model_1.CourseBookingModel.updateStatus(id, teacherId, data);
        }
        catch (error) {
            throw error;
        }
    }
    static async cancelBooking(id, studentId, reason) {
        try {
            return await course_booking_model_1.CourseBookingModel.cancelByStudent(id, studentId, reason);
        }
        catch (error) {
            throw error;
        }
    }
    static async reactivateBooking(id, studentId) {
        try {
            const booking = await course_booking_model_1.CourseBookingModel.reactivateBooking(id, studentId);
            try {
                const bookingDetails = await course_booking_model_1.CourseBookingModel.findByIdWithDetails(booking.id);
                if (bookingDetails) {
                    const { course, student } = bookingDetails;
                    await this.notificationService.createAndSendNotification({
                        title: `إعادة تفعيل حجز - ${course.courseName}`,
                        message: `قام الطالب ${student.name} بإعادة تفعيل طلب الحجز لدورة ${course.courseName}.`,
                        type: 'booking_status',
                        priority: 'medium',
                        recipientType: 'specific_teachers',
                        recipientIds: [booking.teacherId],
                        data: {
                            bookingId: booking.id,
                            studentId: booking.studentId,
                            courseId: booking.courseId,
                            courseName: course.courseName,
                            studentName: student.name,
                            newStatus: 'pending',
                            action: 'reactivated_by_student'
                        },
                        createdBy: booking.studentId
                    });
                }
            }
            catch (notifyErr) {
                console.error('❌ Error sending reactivation notification to teacher:', notifyErr);
            }
            return booking;
        }
        catch (error) {
            throw error;
        }
    }
    static async deleteBooking(id, userId, userType) {
        try {
            await course_booking_model_1.CourseBookingModel.delete(id, userId, userType);
        }
        catch (error) {
            throw error;
        }
    }
    static async getPendingBookingsCount(teacherId, studyYear) {
        try {
            const result = await course_booking_model_1.CourseBookingModel.findAllByTeacher(teacherId, studyYear, 1, 1, types_1.BookingStatus.PENDING);
            return result.total;
        }
        catch (error) {
            throw error;
        }
    }
    static async getApprovedBookingsCount(studentId, studyYear) {
        try {
            const result = await course_booking_model_1.CourseBookingModel.findAllByStudent(studentId, studyYear, 1, 1, types_1.BookingStatus.APPROVED);
            return result.total;
        }
        catch (error) {
            throw error;
        }
    }
    static async sendNewBookingNotification(booking) {
        try {
            const bookingDetails = await course_booking_model_1.CourseBookingModel.findByIdWithDetails(booking.id);
            if (!bookingDetails) {
                console.error('Could not find booking details for notification');
                return;
            }
            const { course, student } = bookingDetails;
            const notificationData = {
                title: `حجز جديد - ${course.courseName}`,
                message: `لديك حجز جديد من الطالب ${student.name} في دورة ${course.courseName}. ${booking.studentMessage ? `رسالة الطالب: ${booking.studentMessage}` : ''}`,
                type: 'new_booking',
                priority: 'high',
                recipientType: 'specific_teachers',
                recipientIds: [booking.teacherId],
                data: {
                    bookingId: booking.id,
                    studentId: booking.studentId,
                    courseId: booking.courseId,
                    courseName: course.courseName,
                    studentName: student.name,
                    studentMessage: booking.studentMessage,
                    bookingDate: booking.createdAt.toISOString(),
                    type: 'new_booking'
                },
                createdBy: booking.studentId
            };
            await this.notificationService.createAndSendNotification(notificationData);
        }
        catch (error) {
            console.error('❌ Error sending new booking notification:', error);
        }
    }
}
exports.CourseBookingService = CourseBookingService;
_a = CourseBookingService;
(() => {
    const oneSignalConfig = {
        appId: process.env['ONESIGNAL_APP_ID'] || '',
        restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || ''
    };
    _a.notificationService = new notification_service_1.NotificationService(oneSignalConfig);
})();
//# sourceMappingURL=course-booking.service.js.map