export type ExamType = 'daily' | 'monthly';
export interface Exam {
    id: string;
    course_id: string;
    subject_id: string;
    teacher_id: string;
    exam_date: string;
    exam_type: ExamType;
    max_score: number;
    description?: string | null;
    notes?: string | null;
    created_at: string;
    updated_at: string;
}
export interface ExamGrade {
    id: string;
    exam_id: string;
    student_id: string;
    score: number;
    graded_at?: string | null;
    graded_by?: string | null;
}
export declare class ExamModel {
    static create(data: Partial<Exam> & {
        teacher_id: string;
    }): Promise<Exam>;
    static update(id: string, patch: Partial<Exam>): Promise<Exam | null>;
    static remove(id: string): Promise<boolean>;
    static getById(id: string): Promise<Exam | null>;
    static listByTeacher(teacherId: string, page?: number, limit?: number, type?: ExamType): Promise<{
        data: Exam[];
        total: number;
    }>;
    static listForStudent(studentId: string, page?: number, limit?: number, type?: ExamType): Promise<{
        data: Exam[];
        total: number;
    }>;
    static setGrade(examId: string, studentId: string, score: number, gradedBy: string): Promise<ExamGrade>;
    static getGrade(examId: string, studentId: string): Promise<ExamGrade | null>;
    static listGrades(examId: string): Promise<ExamGrade[]>;
    static listStudentsForExam(exam: Exam): Promise<{
        id: string;
        name: string;
    }[]>;
    static addExamSessions(examId: string, sessionIds: string[]): Promise<number>;
}
//# sourceMappingURL=exam.model.d.ts.map