import { Request, Response } from 'express';
import { ApiResponse, AuthenticatedRequest } from '../../types';
export declare class TeacherPaymentController {
    static getReservationPayments(req: AuthenticatedRequest & Request, res: Response<ApiResponse>): Promise<Response<ApiResponse<any>, Record<string, any>>>;
    static getReservationPaymentsReport(req: AuthenticatedRequest & Request, res: Response<ApiResponse>): Promise<Response<ApiResponse<any>, Record<string, any>>>;
    static getReservationPaymentByBooking(req: AuthenticatedRequest & Request, res: Response<ApiResponse>): Promise<Response<ApiResponse<any>, Record<string, any>>>;
}
//# sourceMappingURL=payment.controller.d.ts.map