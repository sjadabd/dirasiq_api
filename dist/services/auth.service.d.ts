import { ApiResponse, LoginRequest, RegisterStudentRequest, RegisterSuperAdminRequest, RegisterTeacherRequest } from '../types';
export declare class AuthService {
    static registerSuperAdmin(data: RegisterSuperAdminRequest): Promise<ApiResponse>;
    static registerTeacher(data: RegisterTeacherRequest): Promise<ApiResponse>;
    static registerStudent(data: RegisterStudentRequest): Promise<ApiResponse>;
    static login(data: LoginRequest): Promise<ApiResponse>;
    static logout(token: string): Promise<ApiResponse>;
    static verifyEmail(email: string, code: string): Promise<ApiResponse>;
    static resendVerificationCode(email: string): Promise<ApiResponse>;
    static requestPasswordReset(email: string): Promise<ApiResponse>;
    static resetPassword(email: string, code: string, newPassword: string): Promise<ApiResponse>;
    private static generateToken;
    private static isProfileComplete;
    static googleAuth(googleData: any, userType: 'teacher' | 'student'): Promise<ApiResponse>;
    static completeProfile(userId: string, userType: string, profileData: any): Promise<ApiResponse>;
    private static sanitizeUser;
    private static getEnhancedUserData;
    static updateProfile(userId: string, userType: string, profileData: any): Promise<any>;
}
//# sourceMappingURL=auth.service.d.ts.map