// Public route for teacher application submission — Phase 1.
//
// Mounted at /api/teacher-applications. The only endpoint here is the public
// submit. Reads + actions live on the super-admin router.

import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { TeacherApplicationController } from '../controllers/teacher-application.controller';
import { validate } from '../middleware/validate.middleware';
import { teacherApplicationCreateSchema } from '../schemas/teacher-application.schemas';
import { ApiError, ErrorCodes } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';

const router = Router();

// Per-IP submission limiter. Spam protection on top of the global limiter.
// 3 submissions per IP per hour is enough for legitimate retries (a teacher
// who needs to correct a typo) while blocking scripted abuse.
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  // Tests share one Express instance and exhaust the bucket quickly. The
  // global limiter (1000/15min) still applies in test mode for sanity.
  skip: () => process.env['NODE_ENV'] === 'test',
  handler: () => {
    throw new ApiError(
      429,
      'تم تجاوز عدد محاولات التقديم المسموح بها. حاول لاحقاً.',
      ErrorCodes.RATE_LIMITED
    );
  },
});

router.post(
  '/',
  submitLimiter,
  validate({ body: teacherApplicationCreateSchema }),
  asyncHandler(TeacherApplicationController.create)
);

export default router;
