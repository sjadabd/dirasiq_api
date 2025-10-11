import { SubscriptionPackageController } from '@/controllers/super_admin/subscription-package.controller';
import { Router } from 'express';
// import { authenticateToken, requireTeacher } from '@/middleware/auth.middleware';

const router = Router();

// Teacher-authenticated routes
// router.use(authenticateToken);
// router.use(requireTeacher);

// Get all active subscription packages (Teacher access)
router.get('/active', SubscriptionPackageController.getActivePackages);

export default router;
