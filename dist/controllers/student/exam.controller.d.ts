import { Request, Response } from 'express';
import { ExamService } from '../../services/exam.service';
export declare class StudentExamController {
    static getService(): ExamService;
    static list(req: Request, res: Response): Promise<void>;
    static getById(req: Request, res: Response): Promise<void>;
    static myGrade(req: Request, res: Response): Promise<void>;
    static report(req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=exam.controller.d.ts.map