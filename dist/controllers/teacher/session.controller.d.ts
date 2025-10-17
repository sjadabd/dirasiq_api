import { Request, Response } from 'express';
export declare class TeacherSessionController {
    private static to12h;
    private static to12hFromISO;
    static createSession(req: Request, res: Response): Promise<void>;
    static getSessionAttendanceByDate(req: Request<{
        id: string;
    }>, res: Response): Promise<void>;
    static bulkSetSessionAttendance(req: Request<{
        id: string;
    }>, res: Response): Promise<void>;
    static addAttendees(req: Request<{
        id: string;
    }>, res: Response): Promise<void>;
    static listAttendees(req: Request<{
        id: string;
    }>, res: Response): Promise<void>;
    static getConfirmedStudentsByCourse(req: Request<{
        courseId: string;
    }>, res: Response): Promise<void>;
    static removeAttendees(req: Request<{
        id: string;
    }>, res: Response): Promise<void>;
    static listMySessions(req: Request, res: Response): Promise<void>;
    static updateSession(req: Request<{
        id: string;
    }>, res: Response): Promise<void>;
    static deleteSession(req: Request<{
        id: string;
    }>, res: Response): Promise<void>;
    static endSessionAndNotify(req: Request<{
        id: string;
    }>, res: Response): Promise<void>;
}
//# sourceMappingURL=session.controller.d.ts.map