import { CreateSubjectRequest, Subject, UpdateSubjectRequest } from '../types';
export declare class SubjectModel {
    static create(teacherId: string, data: CreateSubjectRequest): Promise<Subject>;
    static findById(id: string, includeDeleted?: boolean): Promise<Subject | null>;
    static findByIdAndTeacher(id: string, teacherId: string, includeDeleted?: boolean): Promise<Subject | null>;
    static findAllByTeacher(teacherId: string, page?: number, limit?: number, search?: string, includeDeleted?: boolean | null): Promise<{
        subjects: Subject[];
        total: number;
    }>;
    static update(id: string, teacherId: string, data: UpdateSubjectRequest): Promise<Subject | null>;
    static delete(id: string, teacherId: string): Promise<boolean>;
    static restore(id: string, teacherId: string): Promise<boolean>;
    static hardDelete(id: string, teacherId: string): Promise<boolean>;
    static exists(id: string, includeDeleted?: boolean): Promise<boolean>;
    static nameExistsForTeacher(teacherId: string, name: string, excludeId?: string): Promise<boolean>;
    private static mapDatabaseSubjectToSubject;
}
//# sourceMappingURL=subject.model.d.ts.map