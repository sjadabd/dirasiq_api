import { CreateStudentGradeRequest, StudentGrade, UpdateStudentGradeRequest } from '../types';
export declare class StudentGradeModel {
    static create(data: CreateStudentGradeRequest): Promise<StudentGrade>;
    static findById(id: string): Promise<StudentGrade | null>;
    static findByStudentId(studentId: string): Promise<StudentGrade[]>;
    static findActiveByStudentId(studentId: string): Promise<StudentGrade[]>;
    static update(id: string, updateData: UpdateStudentGradeRequest): Promise<StudentGrade | null>;
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
        studentGrades: StudentGrade[];
        total: number;
        totalPages: number;
    }>;
    static findByGradeAndStudyYear(gradeId: string, studyYear: string | number): Promise<StudentGrade[]>;
    private static mapDatabaseStudentGradeToStudentGrade;
}
//# sourceMappingURL=student-grade.model.d.ts.map