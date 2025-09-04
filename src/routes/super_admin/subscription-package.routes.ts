import { SubscriptionPackageController } from '@/controllers/super_admin/subscription-package.controller';
import { authenticateToken, requireSuperAdmin } from '@/middleware/auth.middleware';
import { Router } from 'express';

const router = Router();

router.use(authenticateToken); // Apply authentication middleware
router.use(requireSuperAdmin); // Apply authentication middleware

// Public routes (no authentication required)
router.get('/active', SubscriptionPackageController.getActivePackages);
router.get('/free', SubscriptionPackageController.getFreePackage);
router.get('/:id', SubscriptionPackageController.getPackageById);

// CRUD operations for subscription packages
router.post('/', SubscriptionPackageController.createPackage);
router.put('/:id', SubscriptionPackageController.updatePackage);
router.patch('/:id/activate', SubscriptionPackageController.activatePackage);
router.patch('/:id/deactivate', SubscriptionPackageController.deactivatePackage);
router.delete('/:id', SubscriptionPackageController.deletePackage);

// Get all packages with filters (Super Admin only)
router.get('/', SubscriptionPackageController.getAllPackages);

export default router;
