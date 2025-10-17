import { Request, Response } from 'express';
export declare class GradeController {
    static create(req: Request, res: Response): Promise<void>;
    static getAll(req: Request, res: Response): Promise<void>;
    static getAllActive(_req: Request, res: Response): Promise<void>;
    static getActive(_req: Request, res: Response): Promise<void>;
    static getById(req: Request, res: Response): Promise<void>;
    static update(req: Request, res: Response): Promise<void>;
    static delete(req: Request, res: Response): Promise<void>;
    static getUserGrades(req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=grade.controller.d.ts.map