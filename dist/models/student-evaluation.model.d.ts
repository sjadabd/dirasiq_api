export type EvalRating = 'excellent' | 'very_good' | 'good' | 'fair' | 'weak';
export interface StudentEvaluation {
    id: string;
    student_id: string;
    teacher_id: string;
    eval_date: string;
    scientific_level: EvalRating;
    behavioral_level: EvalRating;
    attendance_level: EvalRating;
    homework_preparation: EvalRating;
    participation_level: EvalRating;
    instruction_following: EvalRating;
    guidance?: string | null;
    notes?: string | null;
    created_at: string;
    updated_at: string;
}
export declare class StudentEvaluationModel {
    static upsertMany(teacherId: string, evalDate: string, items: Array<{
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
    static update(id: string, patch: Partial<StudentEvaluation>): Promise<StudentEvaluation | null>;
    static getById(id: string): Promise<StudentEvaluation | null>;
    static listForTeacher(teacherId: string, options: {
        studentId?: string;
        from?: string;
        to?: string;
        page?: number;
        limit?: number;
    }): Promise<{
        data: StudentEvaluation[];
        total: number;
    }>;
    static listForStudent(studentId: string, options: {
        from?: string;
        to?: string;
        page?: number;
        limit?: number;
    }): Promise<{
        data: StudentEvaluation[];
        total: number;
    }>;
}
//# sourceMappingURL=student-evaluation.model.d.ts.map