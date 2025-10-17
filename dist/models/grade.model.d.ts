import { CreateGradeRequest, Grade, UpdateGradeRequest } from '../types';
export declare class GradeModel {
    static create(data: CreateGradeRequest): Promise<Grade>;
    static findById(id: string): Promise<Grade | null>;
    static findAll(page?: number, limit?: number, search?: string): Promise<{
        grades: Grade[];
        total: number;
    }>;
    static findActive(): Promise<Grade[]>;
    static update(id: string, data: UpdateGradeRequest): Promise<Grade | null>;
    static delete(id: string): Promise<boolean>;
    static exists(id: string): Promise<boolean>;
    static nameExists(name: string, excludeId?: string): Promise<boolean>;
    private static mapDatabaseGradeToGrade;
}
//# sourceMappingURL=grade.model.d.ts.map