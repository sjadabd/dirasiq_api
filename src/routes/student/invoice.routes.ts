import { Router } from 'express';
import { StudentInvoiceController } from '../../controllers/student/invoice.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();
router.use(authenticateToken);

// List student invoices (filter by studyYear/course/status)
router.get('/', StudentInvoiceController.listInvoices);

// Consolidated full invoice details + entries (payments/discounts with installment info)
router.get('/:invoiceId/full', StudentInvoiceController.getInvoiceFull);

// Full details for a single installment (partials and totals)
router.get('/:invoiceId/installments/:installmentId/full', StudentInvoiceController.getInstallmentFull);

export default router;
