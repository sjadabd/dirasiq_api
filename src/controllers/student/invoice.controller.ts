import { Request, Response } from 'express';
import { StudentInvoiceService } from '../../services/student/invoice.service';
import { ApiResponse, AuthenticatedRequest, InvoiceStatus } from '../../types';

export class StudentInvoiceController {
  // GET /student/invoices
  static async listInvoices(req: AuthenticatedRequest & Request, res: Response<ApiResponse>) {
    try {
      const studentId = req.user?.id as string;
      const studyYear = (req.query['studyYear'] as string) || undefined;
      const courseId = (req.query['courseId'] as string) || undefined;
      const status = (req.query['status'] as string) as InvoiceStatus | undefined;
      const page = req.query['page'] ? Number(req.query['page']) : 1;
      const limit = req.query['limit'] ? Number(req.query['limit']) : 10;
      const filters: any = {};
      if (studyYear) filters.studyYear = studyYear;
      if (courseId) filters.courseId = courseId;
      if (status) filters.status = status;

      const { invoices, report } = await StudentInvoiceService.listInvoices(studentId, filters, page, limit);
      return res.json({ success: true, message: 'Invoices fetched', data: { invoices, report, page, limit } });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch invoices' });
    }
  }

  // GET /student/invoices/:invoiceId
  static async getInvoice(req: AuthenticatedRequest & Request, res: Response<ApiResponse>) {
    try {
      const studentId = req.user?.id as string;
      const { invoiceId } = req.params as { invoiceId: string };
      const invoice = await StudentInvoiceService.getInvoice(studentId, invoiceId);
      if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
      return res.json({ success: true, message: 'Invoice fetched', data: invoice });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch invoice' });
    }
  }

  // GET /student/invoices/:invoiceId/installments
  static async listInstallments(req: AuthenticatedRequest & Request, res: Response<ApiResponse>) {
    try {
      const studentId = req.user?.id as string;
      const { invoiceId } = req.params as { invoiceId: string };
      const items = await StudentInvoiceService.listInstallments(studentId, invoiceId);
      if (!items) return res.status(404).json({ success: false, message: 'Invoice not found' });
      return res.json({ success: true, message: 'Installments fetched', data: items });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch installments' });
    }
  }

  // GET /student/invoices/:invoiceId/entries
  static async listEntries(_req: AuthenticatedRequest & Request, res: Response<ApiResponse>) {
    try {
      return res
        .status(410)
        .json({ success: false, message: 'Entries API removed in simplified billing' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch entries' });
    }
  }

  // GET /student/invoices/:invoiceId/full
  static async getInvoiceFull(req: AuthenticatedRequest & Request, res: Response<ApiResponse>) {
    try {
      const studentId = req.user?.id as string;
      const { invoiceId } = req.params as { invoiceId: string };
      const data = await StudentInvoiceService.getInvoiceFull(studentId, invoiceId);
      if (!data) return res.status(404).json({ success: false, message: 'Invoice not found' });
      return res.json({ success: true, message: 'Invoice full details fetched', data });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch invoice' });
    }
  }

  // GET /student/invoices/:invoiceId/installments/:installmentId/full
  static async getInstallmentFull(req: AuthenticatedRequest & Request, res: Response<ApiResponse>) {
    try {
      const studentId = req.user?.id as string;
      const { invoiceId, installmentId } = req.params as { invoiceId: string; installmentId: string };
      const data = await StudentInvoiceService.getInstallmentFull(studentId, invoiceId, installmentId);
      if (!data) return res.status(404).json({ success: false, message: 'Installment or invoice not found' });
      return res.json({ success: true, message: 'Installment full details fetched', data });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch installment' });
    }
  }
}
