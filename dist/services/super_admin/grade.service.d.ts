import { ApiResponse, CreateGradeRequest, UpdateGradeRequest } from '../../types';
export declare class GradeService {
    static create(data: CreateGradeRequest): Promise<ApiResponse>;
    static getAll(page?: number, limit?: number, search?: string): Promise<ApiResponse>;
    static getAllActive(): Promise<{
        success: boolean;
        data: import("../../types").Grade[];
        message?: never;
        errors?: never;
    } | {
        success: boolean;
        message: string;
        errors: any[];
        data?: never;
    }>;
    static getActive(): Promise<ApiResponse>;
    static getById(id: string): Promise<ApiResponse>;
    static update(id: string, data: UpdateGradeRequest): Promise<ApiResponse>;
    static delete(id: string): Promise<ApiResponse>;
    static getUserGrades(userId: string, userType: string, studyYear?: string): Promise<ApiResponse>;
}
//# sourceMappingURL=grade.service.d.ts.map