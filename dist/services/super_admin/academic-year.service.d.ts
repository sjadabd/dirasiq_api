import { ApiResponse, CreateAcademicYearRequest, UpdateAcademicYearRequest } from '../../types';
export declare class AcademicYearService {
    static create(data: CreateAcademicYearRequest): Promise<ApiResponse>;
    static getAll(page?: number, limit?: number, search?: string, isActive?: boolean): Promise<ApiResponse>;
    static getById(id: string): Promise<ApiResponse>;
    static getActive(): Promise<ApiResponse>;
    static update(id: string, data: UpdateAcademicYearRequest): Promise<ApiResponse>;
    static delete(id: string): Promise<ApiResponse>;
    static activate(id: string): Promise<ApiResponse>;
}
//# sourceMappingURL=academic-year.service.d.ts.map