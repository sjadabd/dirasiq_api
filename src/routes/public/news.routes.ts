// /api/public/news — fully public. Used by the marketing site and by the
// Flutter onboarding splash before the user has a token.

import { Router } from 'express';

import { PublicNewsController } from '../../controllers/public/news.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { publicNewsListQuerySchema } from '../../schemas/super-admin.schemas';

const router = Router();

router.get(
  '/',
  validate({ query: publicNewsListQuerySchema }),
  asyncHandler(PublicNewsController.list)
);

export default router;
