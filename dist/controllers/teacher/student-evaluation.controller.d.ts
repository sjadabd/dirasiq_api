import { Request, Response } from 'express';
import { StudentEvaluationService } from '../../services/student-evaluation.service';
export declare class TeacherStudentEvaluationController {
    static getService(): StudentEvaluationService;
    static bulkUpsert(req: Request, res: Response): Promise<void>;
    static update(req: Request, res: Response): Promise<void>;
    static list(req: Request, res: Response): Promise<void>;
    static getById(req: Request, res: Response): Promise<void>;
    static studentsWithEvaluation(req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=student-evaluation.controller.d.ts.map