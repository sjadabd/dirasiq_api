import { Router } from 'express';

import { TeacherInvoiceController } from '../../controllers/teacher/invoice.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { invoiceIdParamSchema } from '../../schemas/common.schemas';
import {
  invoiceCreateSchema,
  invoiceDiscountBodySchema,
  invoiceListQuerySchema,
  invoicePaymentBodySchema,
  invoiceSummaryQuerySchema,
  invoiceUpdateSchema,
} from '../../schemas/teacher.schemas';

const router = Router();

router.post(
  '/',
  validate({ body: invoiceCreateSchema }),
  asyncHandler(TeacherInvoiceController.createInvoice)
);

router.post(
  '/:invoiceId/payments',
  validate({ params: invoiceIdParamSchema, body: invoicePaymentBodySchema }),
  asyncHandler(TeacherInvoiceController.addPayment)
);

router.post(
  '/:invoiceId/discounts',
  validate({ params: invoiceIdParamSchema, body: invoiceDiscountBodySchema }),
  asyncHandler(TeacherInvoiceController.addDiscount)
);

router.patch(
  '/:invoiceId',
  validate({ params: invoiceIdParamSchema, body: invoiceUpdateSchema }),
  asyncHandler(TeacherInvoiceController.updateInvoice)
);

router.get(
  '/',
  validate({ query: invoiceListQuerySchema }),
  asyncHandler(TeacherInvoiceController.listInvoices)
);

router.get(
  '/summary',
  validate({ query: invoiceSummaryQuerySchema }),
  asyncHandler(TeacherInvoiceController.invoicesSummary)
);

router.get(
  '/:invoiceId/installments',
  validate({ params: invoiceIdParamSchema }),
  asyncHandler(TeacherInvoiceController.listInstallments)
);

router.get(
  '/:invoiceId/full',
  validate({ params: invoiceIdParamSchema }),
  asyncHandler(TeacherInvoiceController.getInvoiceFull)
);

router.get(
  '/:invoiceId/entries/report',
  validate({ params: invoiceIdParamSchema }),
  asyncHandler(TeacherInvoiceController.entriesReport)
);

router.delete(
  '/:invoiceId',
  validate({ params: invoiceIdParamSchema }),
  asyncHandler(TeacherInvoiceController.softDeleteInvoice)
);

router.patch(
  '/:invoiceId/restore',
  validate({ params: invoiceIdParamSchema }),
  asyncHandler(TeacherInvoiceController.restoreInvoice)
);

export default router;
