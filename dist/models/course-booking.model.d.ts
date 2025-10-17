import { BookingStatus, CourseBooking, CourseBookingWithDetails, CreateCourseBookingRequest, UpdateCourseBookingRequest } from '../types';
export declare class CourseBookingModel {
    static create(studentId: string, data: CreateCourseBookingRequest): Promise<CourseBooking>;
    static findById(id: string): Promise<CourseBooking | null>;
    static findByIdWithDetails(id: string): Promise<CourseBookingWithDetails | null>;
    static findAllByStudent(studentId: string, studyYear: string, page?: number, limit?: number, status?: BookingStatus, excludeStatus?: BookingStatus): Promise<{
        bookings: CourseBookingWithDetails[];
        total: number;
    }>;
    static findAllByTeacher(teacherId: string, studyYear: string, page?: number, limit?: number, status?: BookingStatus): Promise<{
        bookings: CourseBookingWithDetails[];
        total: number;
    }>;
    static updateStatus(id: string, teacherId: string, data: UpdateCourseBookingRequest): Promise<CourseBooking>;
    static cancelByStudent(id: string, studentId: string, reason?: string): Promise<CourseBooking>;
    static cancelByTeacher(id: string, teacherId: string, reason?: string): Promise<CourseBooking>;
    static reactivateBooking(id: string, studentId: string): Promise<CourseBooking>;
    static delete(id: string, userId: string, userType: string): Promise<void>;
    private static mapDatabaseBookingToBooking;
    private static mapDatabaseBookingWithDetails;
    private static logBookingUsage;
    static getConfirmedStudentIdsByCourse(courseId: string): Promise<string[]>;
    static getConfirmedStudentsDetailedByCourse(courseId: string): Promise<Array<{
        student_id: string;
        student_name: string;
        grade_id: string | null;
        grade_name: string | null;
        study_year: string | null;
    }>>;
}
//# sourceMappingURL=course-booking.model.d.ts.map