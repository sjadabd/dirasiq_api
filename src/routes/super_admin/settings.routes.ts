import { Router } from 'express';

import { SuperAdminSettingsController } from '../../controllers/super_admin/settings.controller';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { UserType } from '../../types';
import {
  bookingConfirmFeeBodySchema,
  paymentFeaturesBodySchema,
} from '../../schemas/super-admin.schemas';

const router = Router();

router.use(authenticateToken, requireRole(UserType.SUPER_ADMIN));

router.get(
  '/booking-confirm-fee',
  asyncHandler(SuperAdminSettingsController.getBookingConfirmFee)
);
router.put(
  '/booking-confirm-fee',
  validate({ body: bookingConfirmFeeBodySchema }),
  asyncHandler(SuperAdminSettingsController.setBookingConfirmFee)
);
router.get(
  '/payment-features',
  asyncHandler(SuperAdminSettingsController.getPaymentFeatures)
);
router.put(
  '/payment-features',
  validate({ body: paymentFeaturesBodySchema }),
  asyncHandler(SuperAdminSettingsController.setPaymentFeatures)
);

export default router;
