export interface Session {
    id: string;
    course_id: string;
    teacher_id: string;
    title?: string | null;
    weekday: number;
    start_time: string;
    end_time: string;
    recurrence: boolean;
    flex_type: 'window' | 'alternates' | 'none';
    flex_minutes?: number | null;
    flex_alternates?: any | null;
    hard_constraints?: any | null;
    soft_constraints?: any | null;
    state: 'draft' | 'proposed' | 'conflict' | 'confirmed' | 'negotiating' | 'rejected' | 'canceled';
    version: number;
    is_deleted: boolean;
    created_at: Date;
    updated_at: Date;
}
export declare class SessionModel {
    static createSession(input: {
        course_id: string;
        teacher_id: string;
        title?: string | null;
        weekday: number;
        start_time: string;
        end_time: string;
        recurrence?: boolean;
        flex_type?: 'window' | 'alternates' | 'none';
        flex_minutes?: number | null;
        flex_alternates?: any | null;
        hard_constraints?: any | null;
        soft_constraints?: any | null;
        state?: 'draft' | 'proposed' | 'conflict' | 'confirmed' | 'negotiating' | 'rejected' | 'canceled';
    }): Promise<Session>;
    static addAttendees(sessionId: string, studentIds: string[]): Promise<void>;
    static removeAttendees(sessionId: string, studentIds: string[]): Promise<number>;
    static listAttendeeIds(sessionId: string): Promise<string[]>;
    static listAttendeesDetailed(sessionId: string): Promise<Array<{
        student_id: string;
        student_name: string;
        grade_id: string | null;
        grade_name: string | null;
        study_year: string | null;
    }>>;
    static getTeacherSessions(teacherId: string, page?: number, limit?: number, filters?: {
        weekday?: number | null;
        courseId?: string | null;
    }): Promise<{
        sessions: any[];
        total: number;
    }>;
    static getStudentWeeklySchedule(studentId: string, weekStartISO: string): Promise<any[]>;
    static getById(id: string): Promise<Session | null>;
    static hasConflict(params: {
        teacherId: string;
        weekday: number;
        startTime: string;
        endTime: string;
        excludeSessionId?: string;
    }): Promise<boolean>;
    static updateSession(id: string, input: {
        title?: string | null;
        weekday?: number;
        start_time?: string;
        end_time?: string;
        recurrence?: boolean;
        flex_type?: 'window' | 'alternates' | 'none';
        flex_minutes?: number | null;
        flex_alternates?: any | null;
        hard_constraints?: any | null;
        soft_constraints?: any | null;
        state?: 'draft' | 'proposed' | 'conflict' | 'confirmed' | 'negotiating' | 'rejected' | 'canceled';
    }): Promise<Session | null>;
    static softDeleteSession(id: string): Promise<boolean>;
}
//# sourceMappingURL=session.model.d.ts.map