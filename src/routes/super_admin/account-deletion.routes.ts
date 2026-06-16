// /api/super-admin/account-deletion-requests — super-admin read-only inbox.
// Future: approve / complete / cancel endpoints will live here.

import { Router } from 'express';

import { SuperAdminAccountDeletionController } from '../../controllers/super_admin/account-deletion.controller';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { accountDeletionListQuerySchema } from '../../schemas/account-deletion.schemas';
import { asyncHandler } from '../../utils/async-handler';
import { UserType } from '../../types';

const router = Router();

router.use(authenticateToken, requireRole(UserType.SUPER_ADMIN));

router.get(
  '/',
  validate({ query: accountDeletionListQuerySchema }),
  asyncHandler(SuperAdminAccountDeletionController.list),
);

export default router;
