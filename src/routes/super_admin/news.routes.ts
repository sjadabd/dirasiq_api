// /api/news — mixed-role surface:
//   - GET /       → any authenticated user (dashboards + Flutter feed)
//   - GET /:id    → any authenticated user
//   - POST /      → super-admin
//   - PUT /:id    → super-admin
//   - DELETE /:id → super-admin
//   - PATCH /:id/publish → super-admin
//
// Truly public news listing lives at `/api/public/news` and is wired
// separately in `routes/public/news.routes.ts`.

import { Router } from 'express';

import { NewsController } from '../../controllers/super_admin/news.controller';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { UserType } from '../../types';
import { idParamSchema } from '../../schemas/common.schemas';
import {
  newsCreateSchema,
  newsListQuerySchema,
  newsUpdateSchema,
} from '../../schemas/super-admin.schemas';

const router = Router();

const adminOnly = [authenticateToken, requireRole(UserType.SUPER_ADMIN)] as const;

// Read endpoints — any authenticated user.
router.get(
  '/',
  authenticateToken,
  validate({ query: newsListQuerySchema }),
  asyncHandler(NewsController.getAll)
);
router.get(
  '/:id',
  authenticateToken,
  validate({ params: idParamSchema }),
  asyncHandler(NewsController.getById)
);

// Write endpoints — super-admin only.
router.post(
  '/',
  ...adminOnly,
  validate({ body: newsCreateSchema }),
  asyncHandler(NewsController.create)
);
router.put(
  '/:id',
  ...adminOnly,
  validate({ params: idParamSchema, body: newsUpdateSchema }),
  asyncHandler(NewsController.update)
);
router.delete(
  '/:id',
  ...adminOnly,
  validate({ params: idParamSchema }),
  asyncHandler(NewsController.delete)
);
router.patch(
  '/:id/publish',
  ...adminOnly,
  validate({ params: idParamSchema }),
  asyncHandler(NewsController.publish)
);

export default router;
