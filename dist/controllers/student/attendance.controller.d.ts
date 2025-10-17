import { Request, Response } from 'express';
export declare class StudentAttendanceController {
    private static to12hFromISO;
    static checkIn(req: Request, res: Response): Promise<void>;
    static getMyAttendanceByCourse(req: Request<{
        courseId: string;
    }>, res: Response): Promise<void>;
}
//# sourceMappingURL=attendance.controller.d.ts.map