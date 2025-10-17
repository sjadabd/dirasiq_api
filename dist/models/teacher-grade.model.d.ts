import { CreateTeacherGradeRequest, TeacherGrade, UpdateTeacherGradeRequest } from '../types';
export declare class TeacherGradeModel {
    static create(data: CreateTeacherGradeRequest): Promise<TeacherGrade>;
    static createMany(teacherId: string, gradeIds: string[], studyYear: string): Promise<TeacherGrade[]>;
    static findById(id: string): Promise<TeacherGrade | null>;
    static findByTeacherId(teacherId: string): Promise<TeacherGrade[]>;
    static findActiveByTeacherId(teacherId: string): Promise<TeacherGrade[]>;
    static update(id: string, updateData: UpdateTeacherGradeRequest): Promise<TeacherGrade | null>;
    static delete(id: string): Promise<boolean>;
    static findAll(params: {
        page?: number;
        limit?: number;
        search?: string;
        sortBy?: {
            key: string;
            order: 'asc' | 'desc';
        };
        deleted?: boolean;
    }): Promise<{
        teacherGrades: TeacherGrade[];
        total: number;
        totalPages: number;
    }>;
    private static mapDatabaseTeacherGradeToTeacherGrade;
}
//# sourceMappingURL=teacher-grade.model.d.ts.map