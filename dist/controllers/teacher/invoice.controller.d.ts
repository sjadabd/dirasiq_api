import { Request, Response } from 'express';
import { ApiResponse, AuthenticatedRequest } from '../../types';
export declare class TeacherInvoiceController {
    static updateInvoice(req: AuthenticatedRequest & Request, res: Response<ApiResponse>): Promise<Response<ApiResponse<any>, Record<string, any>>>;
    static createInvoice(req: AuthenticatedRequest & Request, res: Response<ApiResponse>): Promise<Response<ApiResponse<any>, Record<string, any>>>;
    static addPayment(req: AuthenticatedRequest & Request, res: Response<ApiResponse>): Promise<Response<ApiResponse<any>, Record<string, any>>>;
    static addDiscount(req: AuthenticatedRequest & Request, res: Response<ApiResponse>): Promise<Response<ApiResponse<any>, Record<string, any>>>;
    static listInvoices(req: AuthenticatedRequest & Request, res: Response<ApiResponse>): Promise<Response<ApiResponse<any>, Record<string, any>>>;
    static listInstallments(req: AuthenticatedRequest & Request, res: Response<ApiResponse>): Promise<Response<ApiResponse<any>, Record<string, any>>>;
    static getInvoiceFull(req: AuthenticatedRequest & Request, res: Response<ApiResponse>): Promise<Response<ApiResponse<any>, Record<string, any>>>;
    static entriesReport(req: AuthenticatedRequest & Request, res: Response<ApiResponse>): Promise<Response<ApiResponse<any>, Record<string, any>>>;
    static softDeleteInvoice(req: AuthenticatedRequest & Request, res: Response<ApiResponse>): Promise<Response<ApiResponse<any>, Record<string, any>>>;
    static restoreInvoice(req: AuthenticatedRequest & Request, res: Response<ApiResponse>): Promise<Response<ApiResponse<any>, Record<string, any>>>;
    static invoicesSummary(req: AuthenticatedRequest & Request, res: Response<ApiResponse>): Promise<Response<ApiResponse<any>, Record<string, any>>>;
}
//# sourceMappingURL=invoice.controller.d.ts.map