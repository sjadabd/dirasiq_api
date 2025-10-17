import { Request, Response } from 'express';
import { ApiResponse, AuthenticatedRequest } from '../../types';
export declare class StudentInvoiceController {
    static listInvoices(req: AuthenticatedRequest & Request, res: Response<ApiResponse>): Promise<Response<ApiResponse<any>, Record<string, any>>>;
    static getInvoice(req: AuthenticatedRequest & Request, res: Response<ApiResponse>): Promise<Response<ApiResponse<any>, Record<string, any>>>;
    static listInstallments(req: AuthenticatedRequest & Request, res: Response<ApiResponse>): Promise<Response<ApiResponse<any>, Record<string, any>>>;
    static listEntries(_req: AuthenticatedRequest & Request, res: Response<ApiResponse>): Promise<Response<ApiResponse<any>, Record<string, any>>>;
    static getInvoiceFull(req: AuthenticatedRequest & Request, res: Response<ApiResponse>): Promise<Response<ApiResponse<any>, Record<string, any>>>;
    static getInstallmentFull(req: AuthenticatedRequest & Request, res: Response<ApiResponse>): Promise<Response<ApiResponse<any>, Record<string, any>>>;
}
//# sourceMappingURL=invoice.controller.d.ts.map