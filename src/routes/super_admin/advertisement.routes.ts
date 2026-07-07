import { Router } from 'express';

import { SuperAdminAdvertisementController } from '../../controllers/super_admin/advertisement.controller';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  advertisementAdminListQuerySchema,
  advertisementApproveSchema,
  advertisementRejectSchema,
  advertisementSettingsUpdateSchema,
} from '../../schemas/advertisement.schemas';
import { idParamSchema } from '../../schemas/common.schemas';
import { asyncHandler } from '../../utils/async-handler';
import { UserType } from '../../types';

const router = Router();

router.use(authenticateToken, requireRole(UserType.SUPER_ADMIN));

router.get(
  '/settings',
  asyncHandler(SuperAdminAdvertisementController.getSettings),
);

router.patch(
  '/settings',
  validate({ body: advertisementSettingsUpdateSchema }),
  asyncHandler(SuperAdminAdvertisementController.updateSettings),
);

router.get(
  '/statistics/revenue',
  asyncHandler(SuperAdminAdvertisementController.revenueStatistics),
);

router.get(
  '/',
  validate({ query: advertisementAdminListQuerySchema }),
  asyncHandler(SuperAdminAdvertisementController.list),
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(SuperAdminAdvertisementController.getById),
);

router.patch(
  '/:id/approve',
  validate({ params: idParamSchema, body: advertisementApproveSchema }),
  asyncHandler(SuperAdminAdvertisementController.approve),
);

router.patch(
  '/:id/reject',
  validate({ params: idParamSchema, body: advertisementRejectSchema }),
  asyncHandler(SuperAdminAdvertisementController.reject),
);

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(SuperAdminAdvertisementController.remove),
);

export default router;
