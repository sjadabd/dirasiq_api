"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentInvoiceController = void 0;
const invoice_service_1 = require("../../services/student/invoice.service");
class StudentInvoiceController {
    static async listInvoices(req, res) {
        try {
            const studentId = req.user?.id;
            const studyYear = req.query['studyYear'] || undefined;
            const courseId = req.query['courseId'] || undefined;
            const status = req.query['status'];
            const page = req.query['page'] ? Number(req.query['page']) : 1;
            const limit = req.query['limit'] ? Number(req.query['limit']) : 10;
            const filters = {};
            if (studyYear)
                filters.studyYear = studyYear;
            if (courseId)
                filters.courseId = courseId;
            if (status)
                filters.status = status;
            const { invoices, report } = await invoice_service_1.StudentInvoiceService.listInvoices(studentId, filters, page, limit);
            return res.json({ success: true, message: 'Invoices fetched', data: { invoices, report, page, limit } });
        }
        catch (error) {
            return res.status(500).json({ success: false, message: error.message || 'Failed to fetch invoices' });
        }
    }
    static async getInvoice(req, res) {
        try {
            const studentId = req.user?.id;
            const { invoiceId } = req.params;
            const invoice = await invoice_service_1.StudentInvoiceService.getInvoice(studentId, invoiceId);
            if (!invoice)
                return res.status(404).json({ success: false, message: 'Invoice not found' });
            return res.json({ success: true, message: 'Invoice fetched', data: invoice });
        }
        catch (error) {
            return res.status(500).json({ success: false, message: error.message || 'Failed to fetch invoice' });
        }
    }
    static async listInstallments(req, res) {
        try {
            const studentId = req.user?.id;
            const { invoiceId } = req.params;
            const items = await invoice_service_1.StudentInvoiceService.listInstallments(studentId, invoiceId);
            if (!items)
                return res.status(404).json({ success: false, message: 'Invoice not found' });
            return res.json({ success: true, message: 'Installments fetched', data: items });
        }
        catch (error) {
            return res.status(500).json({ success: false, message: error.message || 'Failed to fetch installments' });
        }
    }
    static async listEntries(_req, res) {
        try {
            return res
                .status(410)
                .json({ success: false, message: 'Entries API removed in simplified billing' });
        }
        catch (error) {
            return res.status(500).json({ success: false, message: error.message || 'Failed to fetch entries' });
        }
    }
    static async getInvoiceFull(req, res) {
        try {
            const studentId = req.user?.id;
            const { invoiceId } = req.params;
            const data = await invoice_service_1.StudentInvoiceService.getInvoiceFull(studentId, invoiceId);
            if (!data)
                return res.status(404).json({ success: false, message: 'Invoice not found' });
            return res.json({ success: true, message: 'Invoice full details fetched', data });
        }
        catch (error) {
            return res.status(500).json({ success: false, message: error.message || 'Failed to fetch invoice' });
        }
    }
    static async getInstallmentFull(req, res) {
        try {
            const studentId = req.user?.id;
            const { invoiceId, installmentId } = req.params;
            const data = await invoice_service_1.StudentInvoiceService.getInstallmentFull(studentId, invoiceId, installmentId);
            if (!data)
                return res.status(404).json({ success: false, message: 'Installment or invoice not found' });
            return res.json({ success: true, message: 'Installment full details fetched', data });
        }
        catch (error) {
            return res.status(500).json({ success: false, message: error.message || 'Failed to fetch installment' });
        }
    }
}
exports.StudentInvoiceController = StudentInvoiceController;
//# sourceMappingURL=invoice.controller.js.map