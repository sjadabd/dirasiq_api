import { ApiResponse, CreateCourseRequest, UpdateCourseRequest } from '../../types';
export declare class CourseService {
    static create(teacherId: string, data: CreateCourseRequest): Promise<ApiResponse>;
    static listNamesForActiveYear(teacherId: string): Promise<ApiResponse>;
    static getAllByTeacher(teacherId: string, page?: number, limit?: number, search?: string, studyYear?: string, gradeId?: string, subjectId?: string, deleted?: boolean): Promise<ApiResponse>;
    static getById(id: string, teacherId: string): Promise<ApiResponse>;
    static update(id: string, teacherId: string, data: UpdateCourseRequest): Promise<ApiResponse>;
    static delete(id: string, teacherId: string): Promise<ApiResponse>;
    static getDeletedNotExpired(teacherId: string, page?: number, limit?: number): Promise<ApiResponse>;
    static restore(id: string, teacherId: string): Promise<ApiResponse>;
}
//# sourceMappingURL=course.service.d.ts.map