import { Router } from 'express';

import { SuperAdminDashboardController } from '../../controllers/super_admin/dashboard.controller';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { UserType } from '../../types';

const router = Router();

router.use(authenticateToken, requireRole(UserType.SUPER_ADMIN));

router.get('/stats', asyncHandler(SuperAdminDashboardController.getStats));

export default router;
