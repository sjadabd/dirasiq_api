import { Request, Response } from 'express';
export declare class CourseController {
    static listNamesForActiveYear(req: Request, res: Response): Promise<void>;
    static create(req: Request, res: Response): Promise<void>;
    static getAll(req: Request, res: Response): Promise<void>;
    static getById(req: Request, res: Response): Promise<void>;
    static update(req: Request, res: Response): Promise<void>;
    static delete(req: Request, res: Response): Promise<void>;
    static getDeletedNotExpired(req: Request, res: Response): Promise<void>;
    static restore(req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=course.controller.d.ts.map