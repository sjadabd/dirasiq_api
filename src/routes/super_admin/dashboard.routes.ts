import { Router } from 'express';
import { SuperAdminDashboardController } from '../../controllers/super_admin/dashboard.controller';
import {
  authenticateToken,
  requireSuperAdmin,
} from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);
router.use(requireSuperAdmin);

router.get('/stats', SuperAdminDashboardController.getStats);

export default router;
