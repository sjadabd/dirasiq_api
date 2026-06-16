import { Router } from 'express';

import { PublicAccountDeletionController } from '../../controllers/public/account-deletion.controller';
import { validate } from '../../middleware/validate.middleware';
import { accountDeletionRequestSchema } from '../../schemas/public.schemas';
import { asyncHandler } from '../../utils/async-handler';

const router = Router();

router.post(
  '/account-deletion-requests',
  validate({ body: accountDeletionRequestSchema }),
  asyncHandler(PublicAccountDeletionController.submit),
);

export default router;
