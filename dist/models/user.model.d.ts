import { User } from '../types';
export declare class UserModel {
    static create(userData: Partial<User>): Promise<User>;
    static getVerificationCode(email: string): Promise<string | null>;
    static findByEmail(email: string): Promise<User | null>;
    static getAuthProviderByEmail(email: string): Promise<'email' | 'google' | null>;
    static findById(id: string): Promise<User | null>;
    static superAdminExists(): Promise<boolean>;
    static verifyEmail(email: string, code: string): Promise<boolean>;
    static resendVerificationCode(email: string): Promise<boolean>;
    static setPasswordResetCode(email: string): Promise<string | null>;
    static resetPassword(email: string, code: string, newPassword: string): Promise<boolean>;
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
        users: User[];
        total: number;
        totalPages: number;
    }>;
    static update(id: string, updateData: Partial<User>): Promise<User | null>;
    static delete(id: string): Promise<boolean>;
    private static generateVerificationCode;
    static findTeachersByLocation(latitude: number, longitude: number, maxDistance: number, limit: number, offset: number): Promise<any[]>;
    static findTeachersByLocationNames(limit: number, offset: number, state?: string, city?: string, suburb?: string): Promise<any[]>;
    private static mapDatabaseUserToUser;
}
//# sourceMappingURL=user.model.d.ts.map