// /api/super-admin/intro-videos — teacher intro-video moderation queue.

import { Router } from 'express';

import {
  SuperAdminIntroVideoController,
  introVideoAdminListQuerySchema,
  introVideoApproveBodySchema,
  introVideoRejectBodySchema,
  introVideoTeacherIdParamSchema,
} from '../../controllers/super_admin/intro-video.controller';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware';
import { UserType } from '../../types';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';

const router = Router();

router.use(authenticateToken, requireRole(UserType.SUPER_ADMIN));

router.get(
  '/',
  validate({ query: introVideoAdminListQuerySchema }),
  asyncHandler(SuperAdminIntroVideoController.list)
);

router.get(
  '/:teacherId',
  validate({ params: introVideoTeacherIdParamSchema }),
  asyncHandler(SuperAdminIntroVideoController.detail)
);

router.post(
  '/:teacherId/approve',
  validate({ params: introVideoTeacherIdParamSchema, body: introVideoApproveBodySchema }),
  asyncHandler(SuperAdminIntroVideoController.approve)
);

router.post(
  '/:teacherId/reject',
  validate({ params: introVideoTeacherIdParamSchema, body: introVideoRejectBodySchema }),
  asyncHandler(SuperAdminIntroVideoController.reject)
);

router.post(
  '/:teacherId/sync',
  validate({ params: introVideoTeacherIdParamSchema }),
  asyncHandler(SuperAdminIntroVideoController.sync)
);

export default router;
