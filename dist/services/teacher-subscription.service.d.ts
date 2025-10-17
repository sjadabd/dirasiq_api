import { ApiResponse, CreateTeacherSubscriptionRequest, UpdateTeacherSubscriptionRequest } from '../types';
export declare class TeacherSubscriptionService {
    static create(data: CreateTeacherSubscriptionRequest): Promise<ApiResponse>;
    static findById(id: string): Promise<ApiResponse>;
    static findByTeacherId(teacherId: string): Promise<ApiResponse>;
    static findActiveByTeacherId(teacherId: string): Promise<ApiResponse>;
    static update(id: string, data: UpdateTeacherSubscriptionRequest): Promise<ApiResponse>;
    static delete(id: string): Promise<ApiResponse>;
    static activateForTeacher(teacherId: string, packageId: string): Promise<ApiResponse>;
}
//# sourceMappingURL=teacher-subscription.service.d.ts.map