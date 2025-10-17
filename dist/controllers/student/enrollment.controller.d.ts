import { Request, Response } from 'express';
export declare class StudentEnrollmentController {
    static getMyEnrolledCourses(req: Request, res: Response): Promise<void>;
    static getWeeklySchedule(req: Request, res: Response): Promise<void>;
    static getWeeklyScheduleComprehensive(req: Request, res: Response): Promise<void>;
    static getWeeklyScheduleByCourse(req: Request<{
        courseId: string;
    }>, res: Response): Promise<void>;
}
//# sourceMappingURL=enrollment.controller.d.ts.map