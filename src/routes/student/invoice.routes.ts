import { Router } from 'express';

import { StudentInvoiceController } from '../../controllers/student/invoice.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { invoiceIdParamSchema } from '../../schemas/common.schemas';
import {
  installmentIdParamSchema,
  studentInvoiceListQuerySchema,
} from '../../schemas/student.schemas';

const router = Router();

router.get(
  '/',
  validate({ query: studentInvoiceListQuerySchema }),
  asyncHandler(StudentInvoiceController.listInvoices)
);

router.get(
  '/:invoiceId/full',
  validate({ params: invoiceIdParamSchema }),
  asyncHandler(StudentInvoiceController.getInvoiceFull)
);

router.get(
  '/:invoiceId/installments/:installmentId/full',
  validate({ params: installmentIdParamSchema }),
  asyncHandler(StudentInvoiceController.getInstallmentFull)
);

export default router;
