import { Router } from 'express';
import { GradeController } from '../../controllers/super_admin/grade.controller';
import { authenticateToken, requireSuperAdmin } from '../../middleware/auth.middleware';

const router = Router();

router.get('/all-student', GradeController.getAllActive);
router.use(authenticateToken);
router.get('/all', GradeController.getAllActive);
router.get('/my-grades', GradeController.getUserGrades);

/**
 * === مسارات Super Admin ===
 * تحتاج تسجيل الدخول + صلاحية Super Admin
 */
router.use(requireSuperAdmin);
router.post('/', GradeController.create);
router.get('/', GradeController.getAll);
router.get('/:id', GradeController.getById);
router.put('/:id', GradeController.update);
router.delete('/:id', GradeController.delete);
router.get('/active', GradeController.getActive);

export default router;
