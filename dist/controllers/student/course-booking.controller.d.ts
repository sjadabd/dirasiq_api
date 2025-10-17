import { Request, Response } from 'express';
export declare class StudentCourseBookingController {
    static createBooking(req: Request, res: Response): Promise<void>;
    static getMyBookings(req: Request, res: Response): Promise<void>;
    static getBookingById(req: Request, res: Response): Promise<void>;
    static cancelBooking(req: Request, res: Response): Promise<void>;
    static reactivateBooking(req: Request, res: Response): Promise<void>;
    static deleteBooking(req: Request, res: Response): Promise<void>;
    static getBookingStats(req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=course-booking.controller.d.ts.map