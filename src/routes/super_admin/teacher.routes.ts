import { Router } from 'express';

import { SuperAdminTeacherController } from '../../controllers/super_admin/teacher.controller';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { UserType } from '../../types';
import { idParamSchema } from '../../schemas/common.schemas';
import { superAdminTeacherListQuerySchema } from '../../schemas/super-admin.schemas';

const router = Router();

router.use(authenticateToken, requireRole(UserType.SUPER_ADMIN));

router.get(
  '/',
  validate({ query: superAdminTeacherListQuerySchema }),
  asyncHandler(SuperAdminTeacherController.listTeachers)
);
router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(SuperAdminTeacherController.getTeacherDetails)
);

export default router;
