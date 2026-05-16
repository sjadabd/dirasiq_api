// /api/super-admin/subscription-packages — super-admin only.
//
// Read-side public mounts (`/active`, `/free`, `/:id`) live at the top-level
// `/api/subscription-packages/*` and are wired in `src/index.ts` directly to
// the controller so the dashboard's package picker can call them without
// authentication.

import { Router } from 'express';

import { SubscriptionPackageController } from '../../controllers/super_admin/subscription-package.controller';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { UserType } from '../../types';
import { idParamSchema } from '../../schemas/common.schemas';
import {
  subscriptionPackageCreateSchema,
  subscriptionPackageListQuerySchema,
  subscriptionPackageUpdateSchema,
} from '../../schemas/super-admin.schemas';

const router = Router();

router.use(authenticateToken, requireRole(UserType.SUPER_ADMIN));

router.post(
  '/',
  validate({ body: subscriptionPackageCreateSchema }),
  asyncHandler(SubscriptionPackageController.createPackage)
);

router.get(
  '/',
  validate({ query: subscriptionPackageListQuerySchema }),
  asyncHandler(SubscriptionPackageController.getAllPackages)
);

router.get('/active', asyncHandler(SubscriptionPackageController.getActivePackages));
router.get('/free', asyncHandler(SubscriptionPackageController.getFreePackage));

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(SubscriptionPackageController.getPackageById)
);

router.put(
  '/:id',
  validate({ params: idParamSchema, body: subscriptionPackageUpdateSchema }),
  asyncHandler(SubscriptionPackageController.updatePackage)
);

router.patch(
  '/:id/activate',
  validate({ params: idParamSchema }),
  asyncHandler(SubscriptionPackageController.activatePackage)
);

router.patch(
  '/:id/deactivate',
  validate({ params: idParamSchema }),
  asyncHandler(SubscriptionPackageController.deactivatePackage)
);

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(SubscriptionPackageController.deletePackage)
);

export default router;
