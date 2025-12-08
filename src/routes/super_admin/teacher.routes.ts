import { Router } from 'express';
import { SuperAdminTeacherController } from '../../controllers/super_admin/teacher.controller';
import {
  authenticateToken,
  requireSuperAdmin,
} from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);
router.use(requireSuperAdmin);

router.get('/', SuperAdminTeacherController.listTeachers);
router.get('/:id', SuperAdminTeacherController.getTeacherDetails);

export default router;
