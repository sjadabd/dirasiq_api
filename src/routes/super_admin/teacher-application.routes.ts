// Super-admin routes for /api/super-admin/teacher-applications/* — Phase 1.
//
// Auth + role enforcement happen at the router level so every route below
// inherits both checks. Phase 2 will add PATCH /:id/{approve|reject|request-more-info}.

import { Router } from 'express';

import { z } from 'zod';

import { SuperAdminTeacherApplicationController } from '../../controllers/super_admin/teacher-application.controller';
import {
  authenticateToken,
  requireRole,
} from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  teacherApplicationApproveBodySchema,
  teacherApplicationIdParamSchema,
  teacherApplicationListQuerySchema,
  teacherApplicationNeedsMoreInfoBodySchema,
  teacherApplicationRejectBodySchema,
} from '../../schemas/teacher-application.schemas';
import { uuidSchema } from '../../schemas/common.schemas';
import { UserType } from '../../types';
import { asyncHandler } from '../../utils/async-handler';

// Param schema for nested file endpoints: { id, fileId }.
const applicationFileParamsSchema = z.object({
  id: uuidSchema,
  fileId: uuidSchema,
});

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

router.patch(
  '/:id/approve',
  validate({
    params: teacherApplicationIdParamSchema,
    body: teacherApplicationApproveBodySchema,
  }),
  asyncHandler(SuperAdminTeacherApplicationController.approve)
);

router.patch(
  '/:id/reject',
  validate({
    params: teacherApplicationIdParamSchema,
    body: teacherApplicationRejectBodySchema,
  }),
  asyncHandler(SuperAdminTeacherApplicationController.reject)
);

router.patch(
  '/:id/request-more-info',
  validate({
    params: teacherApplicationIdParamSchema,
    body: teacherApplicationNeedsMoreInfoBodySchema,
  }),
  asyncHandler(SuperAdminTeacherApplicationController.requestMoreInfo)
);

// ---------------------------------------------------------------------------
// Phase 3 — file reads (auth-gated streaming)
// ---------------------------------------------------------------------------

router.get(
  '/:id/files',
  validate({ params: teacherApplicationIdParamSchema }),
  asyncHandler(SuperAdminTeacherApplicationController.listFiles)
);

router.get(
  '/:id/files/:fileId',
  validate({ params: applicationFileParamsSchema }),
  asyncHandler(SuperAdminTeacherApplicationController.streamFile)
);

export default router;
