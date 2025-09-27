import { NewsController } from '@/controllers/super_admin/news.controller';
import { authenticateToken, requireSuperAdmin } from '@/middleware/auth.middleware';
import { Router } from 'express';

const router = Router();

// ✅ كل المسارات محمية بالسوبر أدمن
router.use(authenticateToken);

// جلب جميع الأخبار مع الترقيم والبحث
router.get('/', NewsController.getAll);

// جلب خبر واحد بالـ ID
router.get('/:id', NewsController.getById);

router.use(requireSuperAdmin);

// إنشاء خبر جديد
router.post('/', NewsController.create);

// تحديث خبر
router.put('/:id', NewsController.update);

// حذف خبر (Soft Delete)
router.delete('/:id', NewsController.delete);

// نشر خبر
router.patch('/:id/publish', NewsController.publish);

export default router;
