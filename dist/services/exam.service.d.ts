import { Exam, ExamGrade, ExamModel, ExamType } from '../models/exam.model';
export declare class ExamService {
    get model(): typeof ExamModel;
    createExam(payload: Partial<Exam> & {
        teacher_id: string;
    }): Promise<Exam>;
    updateExam(id: string, patch: Partial<Exam>): Promise<Exam | null>;
    removeExam(id: string): Promise<boolean>;
    getById(id: string): Promise<Exam | null>;
    listByTeacher(teacherId: string, page?: number, limit?: number, type?: ExamType): Promise<{
        data: Exam[];
        total: number;
    }>;
    listForStudent(studentId: string, page?: number, limit?: number, type?: ExamType): Promise<{
        data: Exam[];
        total: number;
    }>;
    setGrade(examId: string, studentId: string, score: number, gradedBy: string): Promise<ExamGrade>;
}
//# sourceMappingURL=exam.service.d.ts.map