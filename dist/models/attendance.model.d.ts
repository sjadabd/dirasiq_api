export interface SessionWithComputedTimes {
    id: string;
    course_id: string;
    teacher_id: string;
    weekday: number;
    start_time: string;
    end_time: string;
}
export interface AttendanceRecord {
    id: string;
    session_id: string;
    course_id: string;
    teacher_id: string;
    student_id: string;
    occurred_on: string;
    checkin_at: string;
}
export declare class AttendanceModel {
    static findActiveSessionForTeacherNow(teacherId: string): Promise<SessionWithComputedTimes | null>;
    static isStudentEligibleForSession(sessionId: string, _courseId: string, studentId: string): Promise<boolean>;
    static hasCheckedIn(sessionId: string, studentId: string, occurredOnISO: string): Promise<boolean>;
    static checkIn(params: {
        sessionId: string;
        courseId: string;
        teacherId: string;
        studentId: string;
        occurredOnISO: string;
        source?: 'qr' | 'manual' | 'system';
    }): Promise<AttendanceRecord>;
    static getCheckedInStudentIds(sessionId: string, occurredOnISO: string): Promise<string[]>;
    static getSessionAttendanceForDate(sessionId: string, dateISO: string): Promise<Array<{
        student_id: string;
        student_name: string;
        status: 'present' | 'absent' | 'leave';
        checkin_at: string | null;
    }>>;
    static bulkSetAttendanceStatuses(params: {
        sessionId: string;
        courseId: string;
        teacherId: string;
        dateISO: string;
        items: Array<{
            studentId: string;
            status: 'present' | 'absent' | 'leave';
        }>;
    }): Promise<{
        updated: number;
    }>;
    static getStudentAttendanceByCourse(studentId: string, courseId: string): Promise<Array<{
        occurred_on: string;
        status: 'present' | 'absent' | 'leave';
        checkin_at: string | null;
        session_id: string;
    }>>;
}
//# sourceMappingURL=attendance.model.d.ts.map