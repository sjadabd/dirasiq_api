import { GradeController } from '@/controllers/grade.controller';
import { authenticateToken, requireSuperAdmin } from '@/middleware/auth.middleware';
import { Router } from 'express';

const router = Router();

// Public route - no authentication required
router.get('/active', GradeController.getActive);

// Protected routes - require authentication and super admin role
router.use(authenticateToken);
router.use(requireSuperAdmin);

// Grade management routes (Super Admin only)
router.post('/', GradeController.create);
router.get('/', GradeController.getAll);
router.get('/:id', GradeController.getById);
router.put('/:id', GradeController.update);
router.delete('/:id', GradeController.delete);

export default router;
