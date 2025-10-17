import { Request, Response } from 'express';
export declare class TeacherCourseBookingController {
    private static notificationService;
    static getRemainingStudents(req: Request, res: Response): Promise<void>;
    static getMyBookings(req: Request, res: Response): Promise<void>;
    static getBookingById(req: Request, res: Response): Promise<void>;
    static preApproveBooking(req: Request, res: Response): Promise<void>;
    static confirmBooking(req: Request, res: Response): Promise<void>;
    static rejectBooking(req: Request, res: Response): Promise<void>;
    static updateTeacherResponse(req: Request, res: Response): Promise<void>;
    static deleteBooking(req: Request, res: Response): Promise<void>;
    static reactivateBooking(req: Request, res: Response): Promise<void>;
    static getBookingStats(req: Request, res: Response): Promise<void>;
    private static sendBookingStatusNotification;
}
//# sourceMappingURL=course-booking.controller.d.ts.map