import { ApiResponse, StudentGrade } from '../../types';
export declare class StudentService {
    static getActiveGrades(studentId: string): Promise<ApiResponse>;
    static getStudentById(studentId: string): Promise<ApiResponse>;
    static validateStudentLocation(studentId: string): Promise<ApiResponse>;
    static getSuggestedCoursesForStudent(studentId: string, studentGrades: StudentGrade[], studentLocation: {
        latitude: number;
        longitude: number;
    }, maxDistance?: number, page?: number, limit?: number): Promise<ApiResponse>;
    static getCourseByIdForStudent(courseId: string, studentId: string): Promise<ApiResponse>;
    private static calculateDistance;
    private static toRadians;
}
export interface SuggestedTeacherRow {
    id: string;
    name: string;
    phone?: string;
    address?: string;
    bio?: string;
    experience_years?: number;
    latitude?: number;
    longitude?: number;
    profile_image_path?: string | null;
    distance: number;
}
export declare namespace StudentService {
    function getWeeklySchedule(studentId: string): Promise<ApiResponse>;
    function getDashboardOverview(studentId: string): Promise<ApiResponse>;
    function getTeacherSubjectsAndCoursesForStudent(teacherId: string, page?: number, limit?: number, search?: string, gradeId?: string, subjectId?: string, studyYear?: string): Promise<ApiResponse>;
    function getSuggestedTeachersForStudent(studentId: string, search: string | undefined, maxDistance?: number, page?: number, limit?: number): Promise<ApiResponse>;
}
//# sourceMappingURL=student.service.d.ts.map