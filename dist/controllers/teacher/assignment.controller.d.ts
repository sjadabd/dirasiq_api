import { Request, Response } from 'express';
import { AssignmentService } from '../../services/assignment.service';
export declare class TeacherAssignmentController {
    static getService(): AssignmentService;
    static students(req: Request, res: Response): Promise<void>;
    static overview(req: Request, res: Response): Promise<void>;
    static recipients(req: Request, res: Response): Promise<void>;
    static getStudentSubmission(req: Request, res: Response): Promise<void>;
    static create(req: Request, res: Response): Promise<void>;
    static list(req: Request, res: Response): Promise<void>;
    static getById(req: Request, res: Response): Promise<void>;
    static update(req: Request, res: Response): Promise<void>;
    static remove(req: Request, res: Response): Promise<void>;
    static setRecipients(req: Request, res: Response): Promise<void>;
    static grade(req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=assignment.controller.d.ts.map