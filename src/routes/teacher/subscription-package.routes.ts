// Subscription-package endpoints mounted at /api/teacher/subscription-packages/*.
//
// Mixed-auth contract (per-route gating, NOT inherited from the teacher
// router). The reads are public so guests on the marketing / pricing page
// can list and inspect packages without a session. The mutation is
// teacher-only because it subscribes `req.user.id` to a package.
//
// This file is mounted in `routes/teacher/index.ts` BEFORE the parent
// `router.use(authenticateToken, requireRole(TEACHER))` line, so it does
// not inherit the parent auth gate. Each route below declares the exact
// middleware it needs.
//
// The controller is shared with the super-admin surface
// (`super_admin/subscription-package.controller.ts`).

import { Router } from 'express';

import { SubscriptionPackageController } from '../../controllers/super_admin/subscription-package.controller';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { idParamSchema } from '../../schemas/common.schemas';
import { UserType } from '../../types';
import { asyncHandler } from '../../utils/async-handler';

const router = Router();

// PUBLIC — list active packages. Used by the landing/pricing page for guests.
router.get('/active', asyncHandler(SubscriptionPackageController.getActivePackages));

// PUBLIC — package details by id. Same audience as /active.
router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(SubscriptionPackageController.getPackageById)
);

// TEACHER-ONLY — subscribe the authenticated teacher to a package.
router.post(
  '/:id/activate',
  authenticateToken,
  requireRole(UserType.TEACHER),
  validate({ params: idParamSchema }),
  asyncHandler(SubscriptionPackageController.activateForTeacher)
);

export default router;
