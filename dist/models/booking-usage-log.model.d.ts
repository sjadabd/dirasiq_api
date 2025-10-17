export interface BookingUsageLog {
    id: string;
    bookingId: string;
    teacherId: string;
    studentId: string;
    teacherSubscriptionId: string;
    actionType: 'approved' | 'rejected' | 'cancelled' | 'reactivated';
    previousStatus?: string;
    newStatus: string;
    studentsBefore: number;
    studentsAfter: number;
    reason?: string;
    performedBy: 'teacher' | 'student' | 'system';
    createdAt: Date;
}
export interface CreateBookingUsageLogRequest {
    bookingId: string;
    teacherId: string;
    studentId: string;
    teacherSubscriptionId: string;
    actionType: 'approved' | 'rejected' | 'cancelled' | 'reactivated';
    previousStatus?: string;
    newStatus: string;
    studentsBefore: number;
    studentsAfter: number;
    reason?: string | undefined;
    performedBy: 'teacher' | 'student' | 'system';
}
export declare class BookingUsageLogModel {
    static create(data: CreateBookingUsageLogRequest): Promise<BookingUsageLog>;
    static findById(id: string): Promise<BookingUsageLog | null>;
    static findByTeacherId(teacherId: string, page?: number, limit?: number, actionType?: string): Promise<{
        logs: BookingUsageLog[];
        total: number;
        totalPages: number;
    }>;
    static findBySubscriptionId(subscriptionId: string, page?: number, limit?: number): Promise<{
        logs: BookingUsageLog[];
        total: number;
        totalPages: number;
    }>;
    static getTeacherUsageStats(teacherId: string): Promise<{
        totalApprovals: number;
        totalRejections: number;
        totalCancellations: number;
        totalReactivations: number;
        currentStudents: number;
        maxStudents: number;
    }>;
    static getRecentLogs(limit?: number): Promise<BookingUsageLog[]>;
    private static mapDbToModel;
}
//# sourceMappingURL=booking-usage-log.model.d.ts.map