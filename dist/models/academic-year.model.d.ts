import { AcademicYear, CreateAcademicYearRequest, UpdateAcademicYearRequest } from '../types';
export declare class AcademicYearModel {
    static create(data: CreateAcademicYearRequest): Promise<AcademicYear>;
    static findById(id: string): Promise<AcademicYear | null>;
    static findByYear(year: string): Promise<AcademicYear | null>;
    static findAll(page?: number, limit?: number, search?: string, isActive?: boolean): Promise<{
        academicYears: AcademicYear[];
        total: number;
    }>;
    static getActive(): Promise<AcademicYear | null>;
    static update(id: string, data: UpdateAcademicYearRequest): Promise<AcademicYear | null>;
    static delete(id: string): Promise<boolean>;
    static exists(id: string): Promise<boolean>;
    static yearExists(year: string, excludeId?: string): Promise<boolean>;
    static activate(id: string): Promise<AcademicYear | null>;
}
//# sourceMappingURL=academic-year.model.d.ts.map