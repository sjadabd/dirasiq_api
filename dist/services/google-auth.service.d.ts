export declare class GoogleAuthService {
    private static client;
    static initialize(): void;
    static verifyGoogleToken(idToken: string): Promise<{
        success: boolean;
        data?: any;
        error?: string;
    }>;
    static validateGoogleData(googleData: any): {
        isValid: boolean;
        errors: string[];
    };
    private static isValidEmail;
    static verifyGoogleDataWithSecurity(googleData: any): Promise<{
        success: boolean;
        data?: any;
        errors: string[];
    }>;
}
//# sourceMappingURL=google-auth.service.d.ts.map