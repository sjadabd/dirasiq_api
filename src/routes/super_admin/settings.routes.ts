import { Router } from 'express';
import { SuperAdminSettingsController } from '../../controllers/super_admin/settings.controller';
import {
  authenticateToken,
  requireSuperAdmin,
} from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);
router.use(requireSuperAdmin);

router.get(
  '/booking-confirm-fee',
  SuperAdminSettingsController.getBookingConfirmFee
);
router.put(
  '/booking-confirm-fee',
  SuperAdminSettingsController.setBookingConfirmFee
);

export default router;
