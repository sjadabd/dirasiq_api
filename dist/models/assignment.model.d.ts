export type SubmissionType = 'text' | 'file' | 'link' | 'mixed';
export type Visibility = 'all_students' | 'group' | 'specific_students';
export type SubmissionStatus = 'submitted' | 'late' | 'graded' | 'returned';
export interface Assignment {
    id: string;
    course_id: string;
    subject_id?: string | null;
    session_id?: string | null;
    teacher_id: string;
    title: string;
    description?: string | null;
    assigned_date: string;
    due_date?: string | null;
    submission_type: SubmissionType;
    attachments: any;
    resources: any;
    max_score: number;
    is_active: boolean;
    visibility: Visibility;
    study_year?: string | null;
    grade_id?: string | null;
    created_at: string;
    updated_at: string;
    deleted_at?: string | null;
    created_by: string;
}
export interface AssignmentSubmission {
    id: string;
    assignment_id: string;
    student_id: string;
    submitted_at?: string | null;
    status: SubmissionStatus;
    content_text?: string | null;
    link_url?: string | null;
    attachments: any;
    score?: number | null;
    graded_at?: string | null;
    graded_by?: string | null;
    feedback?: string | null;
    created_at: string;
    updated_at: string;
}
export declare class AssignmentModel {
    static create(data: Partial<Assignment> & {
        created_by: string;
    }): Promise<Assignment>;
    static update(id: string, patch: Partial<Assignment>): Promise<Assignment | null>;
    static softDelete(id: string): Promise<boolean>;
    static getById(id: string): Promise<Assignment | null>;
    static listByTeacher(teacherId: string, page?: number, limit?: number, studyYear?: string | null): Promise<{
        data: Assignment[];
        total: number;
    }>;
    static setRecipients(assignmentId: string, studentIds: string[]): Promise<void>;
    static listForStudent(studentId: string, page?: number, limit?: number, studyYear?: string | null): Promise<{
        data: Assignment[];
        total: number;
    }>;
    static upsertSubmission(assignmentId: string, studentId: string, payload: Partial<AssignmentSubmission>): Promise<AssignmentSubmission>;
    static getSubmission(assignmentId: string, studentId: string): Promise<AssignmentSubmission | null>;
    static listSubmissionsByAssignment(assignmentId: string): Promise<AssignmentSubmission[]>;
    static gradeSubmission(assignmentId: string, studentId: string, score: number, gradedBy: string, feedback?: string): Promise<AssignmentSubmission | null>;
    static getRecipientIds(assignmentId: string): Promise<string[]>;
}
//# sourceMappingURL=assignment.model.d.ts.map