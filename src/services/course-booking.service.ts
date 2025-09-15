import { CourseBookingModel } from '@/models/course-booking.model';
import { NotificationService } from '@/services/notification.service';
import { BookingStatus, CourseBooking, CourseBookingWithDetails, CreateCourseBookingRequest, UpdateCourseBookingRequest } from '@/types';

export class CourseBookingService {
  private static notificationService: NotificationService;

  static {
    // Initialize notification service
    const oneSignalConfig = {
      appId: process.env['ONESIGNAL_APP_ID'] || '',
      restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || ''
    };
    this.notificationService = new NotificationService(oneSignalConfig);
  }

  // Create a new course booking
  static async createBooking(studentId: string, data: CreateCourseBookingRequest): Promise<CourseBooking> {
    try {
      const booking = await CourseBookingModel.create(studentId, data);

      // Send notification to teacher about new booking
      await this.sendNewBookingNotification(booking);

      return booking;
    } catch (error) {
      throw error;
    }
  }

  // Get booking by ID
  static async getBookingById(id: string): Promise<CourseBooking | null> {
    try {
      return await CourseBookingModel.findById(id);
    } catch (error) {
      throw error;
    }
  }

  // Get booking by ID with details
  static async getBookingByIdWithDetails(id: string): Promise<CourseBookingWithDetails | null> {
    try {
      return await CourseBookingModel.findByIdWithDetails(id);
    } catch (error) {
      throw error;
    }
  }

  // Get all bookings for a student
  static async getStudentBookings(
    studentId: string,
    studyYear: string,
    page: number = 1,
    limit: number = 10,
    status?: BookingStatus
  ): Promise<{ bookings: CourseBooking[], total: number }> {
    try {
      return await CourseBookingModel.findAllByStudent(studentId, studyYear, page, limit, status);
    } catch (error) {
      throw error;
    }
  }

  // Get all bookings for a teacher
  static async getTeacherBookings(
    teacherId: string,
    studyYear: string,
    page: number = 1,
    limit: number = 10,
    status?: BookingStatus
  ): Promise<{ bookings: CourseBookingWithDetails[], total: number }> {
    try {
      return await CourseBookingModel.findAllByTeacher(teacherId, studyYear, page, limit, status);
    } catch (error) {
      throw error;
    }
  }

  // Update booking status (for teacher approval/rejection)
  static async updateBookingStatus(
    id: string,
    teacherId: string,
    data: UpdateCourseBookingRequest
  ): Promise<CourseBooking> {
    try {
      return await CourseBookingModel.updateStatus(id, teacherId, data);
    } catch (error) {
      throw error;
    }
  }

  // Cancel booking (for student)
  static async cancelBooking(
    id: string,
    studentId: string,
    reason?: string
  ): Promise<CourseBooking> {
    try {
      return await CourseBookingModel.cancelByStudent(id, studentId, reason);
    } catch (error) {
      throw error;
    }
  }

  // Reactivate cancelled booking (for student)
  static async reactivateBooking(
    id: string,
    studentId: string
  ): Promise<CourseBooking> {
    try {
      return await CourseBookingModel.reactivateBooking(id, studentId);
    } catch (error) {
      throw error;
    }
  }

  // Delete booking (soft delete)
  static async deleteBooking(
    id: string,
    userId: string,
    userType: string
  ): Promise<void> {
    try {
      await CourseBookingModel.delete(id, userId, userType);
    } catch (error) {
      throw error;
    }
  }

  // Get pending bookings count for teacher
  static async getPendingBookingsCount(teacherId: string, studyYear: string): Promise<number> {
    try {
      const result = await CourseBookingModel.findAllByTeacher(teacherId, studyYear, 1, 1, BookingStatus.PENDING);
      return result.total;
    } catch (error) {
      throw error;
    }
  }

  // Get approved bookings count for student
  static async getApprovedBookingsCount(studentId: string, studyYear: string): Promise<number> {
    try {
      const result = await CourseBookingModel.findAllByStudent(studentId, studyYear, 1, 1, BookingStatus.APPROVED);
      return result.total;
    } catch (error) {
      throw error;
    }
  }

  // Send notification to teacher about new booking
  private static async sendNewBookingNotification(booking: CourseBooking): Promise<void> {
    try {
      // Get booking details with course and student information
      const bookingDetails = await CourseBookingModel.findByIdWithDetails(booking.id);

      if (!bookingDetails) {
        console.error('Could not find booking details for notification');
        return;
      }

      const { course, student } = bookingDetails;

      // Create notification data
      const notificationData = {
        title: `حجز جديد - ${course.courseName}`,
        message: `لديك حجز جديد من الطالب ${student.name} في دورة ${course.courseName}. ${booking.studentMessage ? `رسالة الطالب: ${booking.studentMessage}` : ''}`,
        type: 'new_booking' as any,
        priority: 'high' as any,
        recipientType: 'specific_teachers' as any,
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
        createdBy: booking.studentId // The student who created the booking
      };

      // Send notification
      await this.notificationService.createAndSendNotification(notificationData);

      console.log(`✅ New booking notification sent to teacher ${booking.teacherId} for booking ${booking.id}`);
    } catch (error) {
      console.error('❌ Error sending new booking notification:', error);
      // Don't throw error to avoid breaking the booking creation process
    }
  }
}
