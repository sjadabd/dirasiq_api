// /api/super-admin/video-courses — super-admin moderation surface.
// Phase 10.1.A: list + detail + approve / hide / reject / soft-delete.

import { Router } from 'express';

import { SuperAdminVideoCourseController } from '../../controllers/super_admin/video-course.controller';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware';
import { UserType } from '../../types';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import {
  videoCourseAdminListQuerySchema,
  videoCourseApproveSchema,
  videoCourseHideSchema,
  videoCourseIdParamSchema,
  videoCourseRejectSchema,
} from '../../schemas/video-course.schemas';

const router = Router();

// Every endpoint here is super-admin only.
router.use(authenticateToken, requireRole(UserType.SUPER_ADMIN));

router.get(
  '/',
  validate({ query: videoCourseAdminListQuerySchema }),
  asyncHandler(SuperAdminVideoCourseController.list)
);

router.get(
  '/:id',
  validate({ params: videoCourseIdParamSchema }),
  asyncHandler(SuperAdminVideoCourseController.detail)
);

router.patch(
  '/:id/approve',
  validate({ params: videoCourseIdParamSchema, body: videoCourseApproveSchema }),
  asyncHandler(SuperAdminVideoCourseController.approve)
);

router.patch(
  '/:id/hide',
  validate({ params: videoCourseIdParamSchema, body: videoCourseHideSchema }),
  asyncHandler(SuperAdminVideoCourseController.hide)
);

router.patch(
  '/:id/reject',
  validate({ params: videoCourseIdParamSchema, body: videoCourseRejectSchema }),
  asyncHandler(SuperAdminVideoCourseController.reject)
);

router.delete(
  '/:id',
  validate({ params: videoCourseIdParamSchema }),
  asyncHandler(SuperAdminVideoCourseController.remove)
);

export default router;
