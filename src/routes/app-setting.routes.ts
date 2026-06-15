import { Router } from 'express';

import { AppSettingController } from '../controllers/app-setting.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/async-handler';

const router = Router();

router.use(authenticateToken);
router.get(
  '/payment-features',
  asyncHandler(AppSettingController.getPaymentFeatures)
);

export default router;
