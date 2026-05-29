// /api/super-admin/video-course-purchases — super-admin only.
// Phase 4 marketplace refund surface.

import { Router } from 'express';

import { SuperAdminVideoCoursePurchaseController } from '../../controllers/super_admin/video-course-purchase.controller';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware';
import { UserType } from '../../types';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import {
  videoCoursePurchaseIdParamSchema,
  videoCoursePurchaseRefundBodySchema,
} from '../../schemas/video-course.schemas';

const router = Router();

router.use(authenticateToken, requireRole(UserType.SUPER_ADMIN));

router.post(
  '/:id/refund',
  validate({
    params: videoCoursePurchaseIdParamSchema,
    body: videoCoursePurchaseRefundBodySchema,
  }),
  asyncHandler(SuperAdminVideoCoursePurchaseController.refund)
);

export default router;
