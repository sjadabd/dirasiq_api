import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { TeacherWalletController } from '../../controllers/teacher/wallet.controller';
import { TeacherWalletTopupController } from '../../controllers/teacher/wallet-topup.controller';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate.middleware';
import { walletTopupBodySchema, walletTxQuerySchema } from '../../schemas/teacher.schemas';
import { ApiError, ErrorCodes } from '../../utils/api-error';

const router = Router();

router.get('/', asyncHandler(TeacherWalletController.getWallet));
router.get(
  '/transactions',
  validate({ query: walletTxQuerySchema }),
  asyncHandler(TeacherWalletController.listTransactions)
);

// Tighter rate-limit on the topup-link creation endpoint: 10 requests per
// hour per IP. A topup is a real human flow (teacher hits "شحن" → enters
// amount → confirms) — 10/h is plenty. Stops scripted abuse where the same
// authenticated session generates thousands of pay-links to fuzz the
// gateway. Disabled in tests for the same reason as the application
// submit limiter.
const topupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  skip: () => process.env['NODE_ENV'] === 'test',
  handler: () => {
    throw new ApiError(
      429,
      'تم تجاوز عدد محاولات إنشاء رابط الدفع — حاول لاحقاً',
      ErrorCodes.RATE_LIMITED
    );
  },
});

router.post(
  '/topup',
  topupLimiter,
  validate({ body: walletTopupBodySchema }),
  asyncHandler(TeacherWalletTopupController.createTopupLink)
);

export default router;
