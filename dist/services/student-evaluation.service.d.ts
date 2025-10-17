import { EvalRating, StudentEvaluation, StudentEvaluationModel } from '../models/student-evaluation.model';
export declare class StudentEvaluationService {
    get model(): typeof StudentEvaluationModel;
    upsertMany(teacherId: string, evalDate: string, items: Array<{
        student_id: string;
        scientific_level: EvalRating;
        behavioral_level: EvalRating;
        attendance_level: EvalRating;
        homework_preparation: EvalRating;
        participation_level: EvalRating;
        instruction_following: EvalRating;
        guidance?: string | null;
        notes?: string | null;
    }>): Promise<StudentEvaluation[]>;
    update(id: string, patch: Partial<StudentEvaluation>): Promise<StudentEvaluation | null>;
    getById(id: string): Promise<StudentEvaluation | null>;
    listForTeacher(teacherId: string, filters: {
        studentId?: string;
        from?: string;
        to?: string;
        page?: number;
        limit?: number;
    }): Promise<{
        data: StudentEvaluation[];
        total: number;
    }>;
    listForStudent(studentId: string, filters: {
        from?: string;
        to?: string;
        page?: number;
        limit?: number;
    }): Promise<{
        data: StudentEvaluation[];
        total: number;
    }>;
}
//# sourceMappingURL=student-evaluation.service.d.ts.map