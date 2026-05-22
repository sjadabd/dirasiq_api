// Super-admin routes for /api/super-admin/teacher-applications/* — Phase 1.
//
// Auth + role enforcement happen at the router level so every route below
// inherits both checks. Phase 2 will add PATCH /:id/{approve|reject|request-more-info}.

import { Router } from 'express';

import { SuperAdminTeacherApplicationController } from '../../controllers/super_admin/teacher-application.controller';
import {
  authenticateToken,
  requireRole,
} from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  teacherApplicationIdParamSchema,
  teacherApplicationListQuerySchema,
} from '../../schemas/teacher-application.schemas';
import { UserType } from '../../types';
import { asyncHandler } from '../../utils/async-handler';

const router = Router();

router.use(authenticateToken, requireRole(UserType.SUPER_ADMIN));

router.get(
  '/',
  validate({ query: teacherApplicationListQuerySchema }),
  asyncHandler(SuperAdminTeacherApplicationController.list)
);

router.get(
  '/:id',
  validate({ params: teacherApplicationIdParamSchema }),
  asyncHandler(SuperAdminTeacherApplicationController.detail)
);

export default router;
