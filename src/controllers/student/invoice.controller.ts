import type { Request, Response } from 'express';

import { StudentInvoiceService } from '../../services/student/invoice.service';
import { type InvoiceStatus } from '../../types';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok } from '../../utils/response.util';

export class StudentInvoiceController {
  // GET /student/invoices
  static async listInvoices(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const query = req.query as unknown as {
      page?: number;
      limit?: number;
      studyYear?: string;
      courseId?: string;
      status?: InvoiceStatus;
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const filters: Record<string, unknown> = {};
    if (query.studyYear) filters['studyYear'] = query.studyYear;
    if (query.courseId) filters['courseId'] = query.courseId;
    if (query.status) filters['status'] = query.status;

    const { invoices, report } = await StudentInvoiceService.listInvoices(studentId, filters, page, limit);
    // The legacy contract returns `data: { invoices, report, page, limit }`.
    // Preserved verbatim — Flutter consumes both shapes from this endpoint.
    res
      .status(200)
      .json(ok({ invoices, report, page, limit }, 'تم جلب الفواتير'));
  }

  // GET /student/invoices/:invoiceId/full
  static async getInvoiceFull(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const { invoiceId } = req.params as { invoiceId: string };
    const data = await StudentInvoiceService.getInvoiceFull(studentId, invoiceId);
    if (!data) {
      throw new ApiError(404, 'الفاتورة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(ok(data, 'تفاصيل الفاتورة كاملة'));
  }

  // GET /student/invoices/:invoiceId/installments/:installmentId/full
  static async getInstallmentFull(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const { invoiceId, installmentId } = req.params as { invoiceId: string; installmentId: string };
    const data = await StudentInvoiceService.getInstallmentFull(studentId, invoiceId, installmentId);
    if (!data) {
      throw new ApiError(404, 'القسط أو الفاتورة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(ok(data, 'تفاصيل القسط'));
  }
}
