import { Assignment, AssignmentSubmission } from '../models/assignment.model';
export declare class AssignmentService {
    createAssignment(payload: Partial<Assignment> & {
        created_by: string;
    }): Promise<Assignment>;
    listByTeacher(teacherId: string, page?: number, limit?: number, studyYear?: string | null): Promise<{
        data: Assignment[];
        total: number;
    }>;
    getById(id: string): Promise<Assignment | null>;
    update(id: string, patch: Partial<Assignment>): Promise<Assignment | null>;
    softDelete(id: string): Promise<boolean>;
    setRecipients(assignmentId: string, studentIds: string[]): Promise<void>;
    listForStudent(studentId: string, page?: number, limit?: number, studyYear?: string | null): Promise<{
        data: Assignment[];
        total: number;
    }>;
    submit(assignmentId: string, studentId: string, data: Partial<AssignmentSubmission>): Promise<AssignmentSubmission>;
    grade(assignmentId: string, studentId: string, score: number, gradedBy: string, feedback?: string): Promise<AssignmentSubmission | null>;
}
//# sourceMappingURL=assignment.service.d.ts.map