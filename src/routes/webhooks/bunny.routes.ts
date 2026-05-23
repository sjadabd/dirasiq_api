// /api/webhooks/bunny — Bunny Stream callback endpoints. Phase 10.1.A.
//
// Public (no auth) — authenticity is established via HMAC over the raw
// request body. The controller refuses to do any DB work until the
// signature has been verified against BUNNY_STREAM_WEBHOOK_SECRET.

import rateLimit from 'express-rate-limit';
import { Router } from 'express';

import { BunnyWebhookController } from '../../controllers/webhooks/bunny.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { bunnyWebhookSchema } from '../../schemas/video-course.schemas';
import { ApiError, ErrorCodes } from '../../utils/api-error';

const router = Router();

// Defence in depth — Bunny normally calls each lesson at most a handful of
// times. A bucket of 120 calls per IP per minute leaves room for retries
// without exposing the endpoint to floods.
const bunnyWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  skip: () => process.env['NODE_ENV'] === 'test',
  handler: () => {
    throw new ApiError(
      429,
      'Bunny webhook rate exceeded',
      ErrorCodes.RATE_LIMITED
    );
  },
});

router.post(
  '/video-status',
  bunnyWebhookLimiter,
  validate({ body: bunnyWebhookSchema }),
  asyncHandler(BunnyWebhookController.videoStatus)
);

export default router;
