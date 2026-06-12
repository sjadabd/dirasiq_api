// /api/super-admin/withdrawals — super-admin only.
// Teacher payout review: list inbox, approve, reject (releases hold), mark paid
// (uploads the transfer-receipt image).

import { Router } from 'express';

import { SuperAdminWithdrawalController } from '../../controllers/super_admin/withdrawal.controller';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware';
import { UserType } from '../../types';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import {
  withdrawalIdParamSchema,
  withdrawalListQuerySchema,
  withdrawalApproveBodySchema,
  withdrawalRejectBodySchema,
  withdrawalMarkPaidBodySchema,
} from '../../schemas/withdrawal.schemas';

const router = Router();

router.use(authenticateToken, requireRole(UserType.SUPER_ADMIN));

router.get(
  '/',
  validate({ query: withdrawalListQuerySchema }),
  asyncHandler(SuperAdminWithdrawalController.list)
);

router.patch(
  '/:id/approve',
  validate({ params: withdrawalIdParamSchema, body: withdrawalApproveBodySchema }),
  asyncHandler(SuperAdminWithdrawalController.approve)
);

router.patch(
  '/:id/reject',
  validate({ params: withdrawalIdParamSchema, body: withdrawalRejectBodySchema }),
  asyncHandler(SuperAdminWithdrawalController.reject)
);

router.patch(
  '/:id/mark-paid',
  validate({ params: withdrawalIdParamSchema, body: withdrawalMarkPaidBodySchema }),
  asyncHandler(SuperAdminWithdrawalController.markPaid)
);

export default router;
