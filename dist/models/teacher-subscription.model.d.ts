import { CreateTeacherSubscriptionRequest, TeacherSubscription, UpdateTeacherSubscriptionRequest } from '../types';
export declare class TeacherSubscriptionModel {
    static create(data: CreateTeacherSubscriptionRequest): Promise<TeacherSubscription>;
    static findById(id: string): Promise<TeacherSubscription | null>;
    static findByTeacherId(teacherId: string): Promise<TeacherSubscription[]>;
    static findActiveByTeacherId(teacherId: string): Promise<TeacherSubscription | null>;
    static update(id: string, updateData: UpdateTeacherSubscriptionRequest): Promise<TeacherSubscription | null>;
    static delete(id: string): Promise<boolean>;
    static findAll(params: {
        page?: number;
        limit?: number;
        search?: string;
        sortBy?: {
            key: string;
            order: 'asc' | 'desc';
        };
        deleted?: boolean;
    }): Promise<{
        subscriptions: TeacherSubscription[];
        total: number;
        totalPages: number;
    }>;
    static incrementCurrentStudents(teacherId: string): Promise<boolean>;
    static decrementCurrentStudents(teacherId: string): Promise<boolean>;
    static canAddStudent(teacherId: string): Promise<{
        canAdd: boolean;
        currentStudents: number;
        maxStudents: number;
        message?: string;
    }>;
    static recalculateCurrentStudents(teacherId: string): Promise<number>;
    private static mapDbToModel;
}
//# sourceMappingURL=teacher-subscription.model.d.ts.map