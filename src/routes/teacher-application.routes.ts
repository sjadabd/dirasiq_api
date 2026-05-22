// Public routes for teacher applications — Phases 1 + 3.
//
// Mounted at /api/teacher-applications.
//   POST /            (submit)         — phase 1
//   POST /:id/files   (upload one file) — phase 3, gated by X-Upload-Token

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';

import { TeacherApplicationController } from '../controllers/teacher-application.controller';
import { requireUploadToken } from '../middleware/upload-token.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  teacherApplicationCreateSchema,
  teacherApplicationIdParamSchema,
  teacherApplicationResendVerificationSchema,
  teacherApplicationVerifyEmailSchema,
} from '../schemas/teacher-application.schemas';
import { ABSOLUTE_MAX_UPLOAD_BYTES } from '../services/teacher-application-file.service';
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

// ---------------------------------------------------------------------------
// Email verification — Phase 8
// ---------------------------------------------------------------------------
//
// Both endpoints are public + rate-limited (the OTP itself is the secret).
// Re-using the same submitLimiter (3/h per IP) is intentional: a real
// applicant verifies once; an attacker brute-forcing the OTP gets locked
// out alongside the OTP attempt counter on the row itself.

router.post(
  '/:id/verify-email',
  submitLimiter,
  validate({
    params: teacherApplicationIdParamSchema,
    body: teacherApplicationVerifyEmailSchema,
  }),
  asyncHandler(TeacherApplicationController.verifyEmail)
);

router.post(
  '/:id/resend-verification',
  submitLimiter,
  validate({
    params: teacherApplicationIdParamSchema,
    body: teacherApplicationResendVerificationSchema,
  }),
  asyncHandler(TeacherApplicationController.resendVerification)
);

// ---------------------------------------------------------------------------
// File upload — Phase 3
// ---------------------------------------------------------------------------
//
// multer.memoryStorage so we can magic-byte the buffer before writing to
// disk. ABSOLUTE_MAX_UPLOAD_BYTES caps every upload; the service then
// enforces stricter per-kind limits.
//
// The endpoint accepts EXACTLY one part named `file` and a `kind` text
// field. Multipart parsers like multer add `req.file` and `req.body.kind`.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: ABSOLUTE_MAX_UPLOAD_BYTES,
    files: 1,
    fields: 10,
    parts: 12,
  },
});

// Per-IP rate limit on uploads — generous enough for a teacher uploading
// 5 documents in sequence + occasional retries, strict enough to block
// scripted abuse. Disabled in test for the same reason as submitLimiter.
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  skip: () => process.env['NODE_ENV'] === 'test',
  handler: () => {
    throw new ApiError(
      429,
      'تم تجاوز عدد محاولات رفع الملفات المسموح بها. حاول لاحقاً.',
      ErrorCodes.RATE_LIMITED
    );
  },
});

router.post(
  '/:id/files',
  uploadLimiter,
  requireUploadToken,
  upload.single('file'),
  asyncHandler(TeacherApplicationController.uploadFile)
);

export default router;
