import { Request, Response } from 'express';
export declare class AuthController {
    static registerSuperAdmin(req: Request, res: Response): Promise<void>;
    static registerTeacher(req: Request, res: Response): Promise<void>;
    static registerStudent(req: Request, res: Response): Promise<void>;
    static login(req: Request, res: Response): Promise<void>;
    static logout(req: Request, res: Response): Promise<void>;
    static verifyEmail(req: Request, res: Response): Promise<void>;
    static resendVerificationCode(req: Request, res: Response): Promise<void>;
    static requestPasswordReset(req: Request, res: Response): Promise<void>;
    static resetPassword(req: Request, res: Response): Promise<void>;
    static googleAuth(req: Request, res: Response): Promise<void>;
    static completeProfile(req: Request, res: Response): Promise<void>;
    static updateProfile(req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=auth.controller.d.ts.map