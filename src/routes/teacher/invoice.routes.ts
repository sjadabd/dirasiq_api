import { Router } from 'express';
import { authenticateToken } from '@/middleware/auth.middleware';
import { TeacherInvoiceController } from '@/controllers/teacher/invoice.controller';

const router = Router();
router.use(authenticateToken);

// Create invoice (cash or installments)
router.post('/', TeacherInvoiceController.createInvoice);

// Add payment to invoice (optionally tied to an installment)
router.post('/:invoiceId/payments', TeacherInvoiceController.addPayment);

// Add discount to invoice
router.post('/:invoiceId/discounts', TeacherInvoiceController.addDiscount);

// List invoices for current teacher
router.get('/', TeacherInvoiceController.listInvoices);

// Get installments for a specific invoice
router.get('/:invoiceId/installments', TeacherInvoiceController.listInstallments);

// Get entries (payments/discounts/...) for a specific invoice
router.get('/:invoiceId/entries', TeacherInvoiceController.listEntries);

// Get aggregated report for a specific invoice
router.get('/:invoiceId/entries/report', TeacherInvoiceController.entriesReport);

// Soft delete an invoice
router.delete('/:invoiceId', TeacherInvoiceController.softDeleteInvoice);

// Restore a soft-deleted invoice
router.patch('/:invoiceId/restore', TeacherInvoiceController.restoreInvoice);

export default router;
