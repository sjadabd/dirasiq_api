// =============================================================================
// Teacher invoice routes v2 — rebuilt 2026-05-17.
// 9 focused endpoints (was 11). Every endpoint does ONE thing.
//
// Surface:
//   POST   /                       create
//   GET    /                       list + filters + pagination
//   GET    /summary                KPI totals + counts
//   GET    /:invoiceId             single + installments + computed totals
//                                    (replaces /full + /installments + /entries/report)
//   POST   /:invoiceId/payments    add payment (partial-friendly)
//   PATCH  /:invoiceId/meta        update dates + notes (was: monolithic PATCH)
//   PATCH  /:invoiceId/discount    set exact discount (was: POST /discounts)
//   DELETE /:invoiceId             soft delete
//   PATCH  /:invoiceId/restore     restore
// =============================================================================

import { Router } from 'express';

import { TeacherInvoiceController } from '../../controllers/teacher/invoice.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { invoiceIdParamSchema } from '../../schemas/common.schemas';
import {
  invoiceCreateSchema,
  invoiceListQuerySchema,
  invoicePaymentBodySchema,
  invoiceSummaryQuerySchema,
  invoiceUpdateDiscountSchema,
  invoiceUpdateFullSchema,
  invoiceUpdateMetaSchema,
} from '../../schemas/teacher.schemas';

const router = Router();

// Create
router.post(
  '/',
  validate({ body: invoiceCreateSchema }),
  asyncHandler(TeacherInvoiceController.createInvoice),
);

// List + summary
router.get(
  '/',
  validate({ query: invoiceListQuerySchema }),
  asyncHandler(TeacherInvoiceController.listInvoices),
);
router.get(
  '/summary',
  validate({ query: invoiceSummaryQuerySchema }),
  asyncHandler(TeacherInvoiceController.invoicesSummary),
);

// Single (with installments + totals)
router.get(
  '/:invoiceId',
  validate({ params: invoiceIdParamSchema }),
  asyncHandler(TeacherInvoiceController.getInvoiceFull),
);

// Payments
router.post(
  '/:invoiceId/payments',
  validate({ params: invoiceIdParamSchema, body: invoicePaymentBodySchema }),
  asyncHandler(TeacherInvoiceController.addPayment),
);

// Full edit — regenerates installments + notifies the student.
router.put(
  '/:invoiceId',
  validate({ params: invoiceIdParamSchema, body: invoiceUpdateFullSchema }),
  asyncHandler(TeacherInvoiceController.updateInvoiceFull),
);

// Targeted updates (no monolithic PATCH)
router.patch(
  '/:invoiceId/meta',
  validate({ params: invoiceIdParamSchema, body: invoiceUpdateMetaSchema }),
  asyncHandler(TeacherInvoiceController.updateMeta),
);
router.patch(
  '/:invoiceId/discount',
  validate({ params: invoiceIdParamSchema, body: invoiceUpdateDiscountSchema }),
  asyncHandler(TeacherInvoiceController.updateDiscount),
);

// Soft delete + restore
router.delete(
  '/:invoiceId',
  validate({ params: invoiceIdParamSchema }),
  asyncHandler(TeacherInvoiceController.softDeleteInvoice),
);
router.patch(
  '/:invoiceId/restore',
  validate({ params: invoiceIdParamSchema }),
  asyncHandler(TeacherInvoiceController.restoreInvoice),
);

export default router;
