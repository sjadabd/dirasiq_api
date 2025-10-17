import { Request, Response } from 'express';
export declare class SubscriptionPackageController {
    static createPackage(req: Request, res: Response): Promise<void>;
    static getPackageById(req: Request, res: Response): Promise<void>;
    static getAllPackages(req: Request, res: Response): Promise<void>;
    static updatePackage(req: Request, res: Response): Promise<void>;
    static activatePackage(req: Request, res: Response): Promise<void>;
    static deactivatePackage(req: Request, res: Response): Promise<void>;
    static deletePackage(req: Request, res: Response): Promise<void>;
    static getActivePackages(_req: Request, res: Response): Promise<void>;
    static getFreePackage(_req: Request, res: Response): Promise<void>;
    static activateForTeacher(req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=subscription-package.controller.d.ts.map