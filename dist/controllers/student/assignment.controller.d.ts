import { Request, Response } from 'express';
import { AssignmentService } from '../../services/assignment.service';
export declare class StudentAssignmentController {
    static getService(): AssignmentService;
    static list(req: Request, res: Response): Promise<void>;
    static getById(req: Request, res: Response): Promise<void>;
    static mySubmission(req: Request, res: Response): Promise<void>;
    static submit(req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=assignment.controller.d.ts.map