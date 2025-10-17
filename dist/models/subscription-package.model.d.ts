import { CreateSubscriptionPackageRequest, SubscriptionPackage, UpdateSubscriptionPackageRequest } from '../types';
export declare class SubscriptionPackageModel {
    static create(data: CreateSubscriptionPackageRequest): Promise<SubscriptionPackage>;
    static findById(id: string): Promise<SubscriptionPackage | null>;
    static findByName(name: string): Promise<SubscriptionPackage | null>;
    static findBySpecifications(specs: {
        maxStudents: number;
        price: number;
        durationDays: number;
        isFree: boolean;
    }): Promise<SubscriptionPackage | null>;
    static findAll(params: {
        page?: number;
        limit?: number;
        search?: string;
        isActive?: boolean;
        isFree?: boolean;
        sortBy?: {
            key: string;
            order: 'asc' | 'desc';
        };
        deleted?: boolean;
    }): Promise<{
        packages: SubscriptionPackage[];
        total: number;
        totalPages: number;
    }>;
    static update(id: string, updateData: UpdateSubscriptionPackageRequest): Promise<SubscriptionPackage | null>;
    static activate(id: string): Promise<boolean>;
    static deactivate(id: string): Promise<boolean>;
    static delete(id: string): Promise<boolean>;
    static getActivePackages(teacher_id?: string): Promise<any[]>;
    static getFreePackage(): Promise<SubscriptionPackage | null>;
    private static mapDatabaseToSubscriptionPackage;
}
//# sourceMappingURL=subscription-package.model.d.ts.map