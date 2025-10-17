import { Request, Response } from 'express';
import { StudentEvaluationService } from '../../services/student-evaluation.service';
export declare class StudentStudentEvaluationController {
    static getService(): StudentEvaluationService;
    static list(req: Request, res: Response): Promise<void>;
    static getById(req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=student-evaluation.controller.d.ts.map