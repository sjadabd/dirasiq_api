import { CreateSubscriptionPackageRequest, SubscriptionPackage, UpdateSubscriptionPackageRequest } from '../../types';
export declare class SubscriptionPackageService {
    static createPackage(data: CreateSubscriptionPackageRequest): Promise<{
        success: boolean;
        message: string;
        data?: SubscriptionPackage;
        errors?: string[];
    }>;
    static getPackageById(id: string): Promise<{
        success: boolean;
        message: string;
        data?: SubscriptionPackage;
        errors?: string[];
    }>;
    static getAllPackages(params: {
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
        success: boolean;
        message: string;
        data?: SubscriptionPackage[];
        count?: number;
        errors?: string[];
    }>;
    static updatePackage(id: string, data: UpdateSubscriptionPackageRequest): Promise<{
        success: boolean;
        message: string;
        data?: SubscriptionPackage;
        errors?: string[];
    }>;
    static activatePackage(id: string): Promise<{
        success: boolean;
        message: string;
        errors?: string[];
    }>;
    static deactivatePackage(id: string): Promise<{
        success: boolean;
        message: string;
        errors?: string[];
    }>;
    static deletePackage(id: string): Promise<{
        success: boolean;
        message: string;
        errors?: string[];
    }>;
    static getActivePackages(teacher_id?: string): Promise<{
        success: boolean;
        message: string;
        data?: SubscriptionPackage[];
        errors?: string[];
    }>;
    static getFreePackage(): Promise<{
        success: boolean;
        message: string;
        data?: SubscriptionPackage;
        errors?: string[];
    }>;
}
//# sourceMappingURL=subscription-package.service.d.ts.map