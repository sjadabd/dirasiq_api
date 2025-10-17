import { Request, Response } from 'express';
import { ExamService } from '../../services/exam.service';
export declare class TeacherExamController {
    static getService(): ExamService;
    static create(req: Request, res: Response): Promise<void>;
    private static notifyExamCreated;
    static list(req: Request, res: Response): Promise<void>;
    static getById(req: Request, res: Response): Promise<void>;
    static update(req: Request, res: Response): Promise<void>;
    static remove(req: Request, res: Response): Promise<void>;
    static students(req: Request, res: Response): Promise<void>;
    static grade(req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=exam.controller.d.ts.map