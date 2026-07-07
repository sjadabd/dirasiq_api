import { Router } from 'express';

import {
  recordViewLimiter,
  StudentContentFeedController,
} from '../../controllers/student/content-feed.controller';
import { validate } from '../../middleware/validate.middleware';
import { contentFeedQuerySchema } from '../../schemas/advertisement.schemas';
import { idParamSchema } from '../../schemas/common.schemas';
import { asyncHandler } from '../../utils/async-handler';

const router = Router();

router.get(
  '/content-feed',
  validate({ query: contentFeedQuerySchema }),
  asyncHandler(StudentContentFeedController.feed),
);

router.get(
  '/content-feed/news/:id',
  validate({ params: idParamSchema }),
  asyncHandler(StudentContentFeedController.newsDetail),
);

router.get(
  '/advertisements/:id',
  validate({ params: idParamSchema }),
  asyncHandler(StudentContentFeedController.advertisementDetail),
);

router.post(
  '/advertisements/:id/record-view',
  recordViewLimiter,
  validate({ params: idParamSchema }),
  asyncHandler(StudentContentFeedController.recordView),
);

export default router;
