import { BookingStatus, CourseBooking, CourseBookingWithDetails, CreateCourseBookingRequest, UpdateCourseBookingRequest } from '../../types';
export declare class CourseBookingService {
    private static notificationService;
    static createBooking(studentId: string, data: CreateCourseBookingRequest): Promise<CourseBooking>;
    static getBookingById(id: string): Promise<CourseBooking | null>;
    static getBookingByIdWithDetails(id: string): Promise<CourseBookingWithDetails | null>;
    static getStudentBookings(studentId: string, studyYear: string, page?: number, limit?: number, status?: BookingStatus, excludeStatus?: BookingStatus): Promise<{
        bookings: CourseBookingWithDetails[];
        total: number;
    }>;
    static getTeacherBookings(teacherId: string, studyYear: string, page?: number, limit?: number, status?: BookingStatus): Promise<{
        bookings: CourseBookingWithDetails[];
        total: number;
    }>;
    static updateBookingStatus(id: string, teacherId: string, data: UpdateCourseBookingRequest): Promise<CourseBooking>;
    static cancelBooking(id: string, studentId: string, reason?: string): Promise<CourseBooking>;
    static reactivateBooking(id: string, studentId: string): Promise<CourseBooking>;
    static deleteBooking(id: string, userId: string, userType: string): Promise<void>;
    static getPendingBookingsCount(teacherId: string, studyYear: string): Promise<number>;
    static getApprovedBookingsCount(studentId: string, studyYear: string): Promise<number>;
    private static sendNewBookingNotification;
}
//# sourceMappingURL=course-booking.service.d.ts.map