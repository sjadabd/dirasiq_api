export interface TeacherExpense {
    id: string;
    teacher_id: string;
    study_year?: string | null;
    amount: number;
    note?: string | null;
    expense_date: string;
    created_at: Date;
    updated_at: Date;
    deleted_at?: Date | null;
}
export declare class TeacherExpenseModel {
    static create(input: {
        teacherId: string;
        amount: number;
        note?: string | null;
        expenseDate?: string | null;
        studyYear?: string | null;
    }): Promise<TeacherExpense>;
    static softDelete(id: string, teacherId: string): Promise<boolean>;
    static list(teacherId: string, page?: number, limit?: number, from?: string, to?: string, studyYear?: string): Promise<{
        data: TeacherExpense[];
        total: number;
        summary: {
            totalAmount: number;
        };
    }>;
    static sum(teacherId: string, from?: string, to?: string, studyYear?: string): Promise<number>;
    static update(id: string, teacherId: string, patch: {
        amount?: number;
        note?: string | null;
        expenseDate?: string | null;
        studyYear?: string | null;
    }): Promise<TeacherExpense | null>;
}
//# sourceMappingURL=teacher-expense.model.d.ts.map