import { TeacherInvoiceController } from '@/controllers/teacher/invoice.controller';
import { authenticateToken } from '@/middleware/auth.middleware';
import { Router } from 'express';

const router = Router();
router.use(authenticateToken);

// Create invoice (cash or installments)
router.post('/', TeacherInvoiceController.createInvoice);

// Add payment to invoice (optionally tied to an installment)
router.post('/:invoiceId/payments', TeacherInvoiceController.addPayment);

// Add discount to invoice
router.post('/:invoiceId/discounts', TeacherInvoiceController.addDiscount);

// Update invoice (metadata and totals with safe validations)
router.patch('/:invoiceId', TeacherInvoiceController.updateInvoice);

// List invoices for current teacher
router.get('/', TeacherInvoiceController.listInvoices);

// Overall summary (totals only) for current teacher
router.get('/summary', TeacherInvoiceController.invoicesSummary);

// Get installments for a specific invoice
router.get('/:invoiceId/installments', TeacherInvoiceController.listInstallments);

// Get full invoice with summary, installments list, and totals
router.get('/:invoiceId/full', TeacherInvoiceController.getInvoiceFull);

// Get aggregated report for a specific invoice
router.get(
  '/:invoiceId/entries/report',
  TeacherInvoiceController.entriesReport
);

// Soft delete an invoice
router.delete('/:invoiceId', TeacherInvoiceController.softDeleteInvoice);

// Restore a soft-deleted invoice
router.patch('/:invoiceId/restore', TeacherInvoiceController.restoreInvoice);

export default router;
