import { Router } from 'express';
import { SubscriptionPackageController } from '../../controllers/super_admin/subscription-package.controller';
import { authenticateToken, requireTeacher } from '../../middleware/auth.middleware';
import { optionalAuth } from '../../middleware/optionalAuth';

const router = Router();

// ✅ الميدلوير يقرأ التوكن ويملأ res.locals.user إذا وُجد
router.get('/active', optionalAuth, SubscriptionPackageController.getActivePackages);

// Public: جلب باقة واحدة بدون تسجيل دخول
router.get('/:id', SubscriptionPackageController.getPackageById);

// Teacher: تفعيل اشتراك لباقـة معينة
router.post('/:id/activate', authenticateToken, requireTeacher, SubscriptionPackageController.activateForTeacher);

export default router;
