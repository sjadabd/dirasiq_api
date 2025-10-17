import { ApiResponse, CreateSubjectRequest, UpdateSubjectRequest } from '../../types';
export declare class SubjectService {
    static create(teacherId: string, data: CreateSubjectRequest): Promise<ApiResponse>;
    static getAllByTeacher(teacherId: string, page?: number, limit?: number, search?: string, includeDeleted?: boolean | null): Promise<ApiResponse>;
    static getById(id: string, teacherId: string): Promise<ApiResponse>;
    static update(id: string, teacherId: string, data: UpdateSubjectRequest): Promise<ApiResponse>;
    static delete(id: string, teacherId: string): Promise<ApiResponse>;
    static restore(id: string, teacherId: string): Promise<ApiResponse>;
    static hardDelete(id: string, teacherId: string): Promise<ApiResponse>;
    static getAllSubjects(teacherId: string): Promise<ApiResponse>;
}
//# sourceMappingURL=subject.service.d.ts.map