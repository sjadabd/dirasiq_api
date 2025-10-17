import { Course, CreateCourseRequest, UpdateCourseRequest } from '../types';
export declare class CourseModel {
    static create(teacherId: string, data: CreateCourseRequest): Promise<Course>;
    static findNamesByTeacherAndYear(teacherId: string, studyYear: string): Promise<Array<{
        id: string;
        course_name: string;
    }>>;
    static findById(id: string): Promise<Course | null>;
    static findByIdAndTeacher(id: string, teacherId: string): Promise<Course | null>;
    static findAllByTeacher(teacherId: string, page?: number, limit?: number, search?: string, studyYear?: string, gradeId?: string, subjectId?: string, deleted?: boolean): Promise<{
        courses: Course[];
        total: number;
    }>;
    static update(id: string, teacherId: string, data: UpdateCourseRequest): Promise<Course | null>;
    static softDelete(id: string, teacherId: string): Promise<boolean>;
    static exists(id: string): Promise<boolean>;
    static nameExistsForTeacher(teacherId: string, studyYear: string, courseName: string, excludeId?: string): Promise<boolean>;
    static courseExistsForTeacher(teacherId: string, studyYear: string, courseName: string, gradeId: string, subjectId: string, excludeId?: string): Promise<boolean>;
    static findByIdWithRelations(id: string, teacherId: string): Promise<any>;
    static findDeletedNotExpiredByTeacher(teacherId: string, page?: number, limit?: number): Promise<{
        courses: Course[];
        total: number;
    }>;
    static restore(id: string, teacherId: string): Promise<Course | null>;
    static findByGradesAndLocation(gradeIds: string[], studentLocation: {
        latitude: number;
        longitude: number;
    }, maxDistance?: number, limit?: number, offset?: number): Promise<Course[]>;
}
//# sourceMappingURL=course.model.d.ts.map