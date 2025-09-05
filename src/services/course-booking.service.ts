import { CourseBookingModel } from '@/models/course-booking.model';
import { BookingStatus, CourseBooking, CourseBookingWithDetails, CreateCourseBookingRequest, UpdateCourseBookingRequest } from '@/types';

export class CourseBookingService {
  // Create a new course booking
  static async createBooking(studentId: string, data: CreateCourseBookingRequest): Promise<CourseBooking> {
    try {
      return await CourseBookingModel.create(studentId, data);
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
}
