import { Router } from 'express';

import { AuthController } from '../controllers/auth.controller';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import { requireBootstrapToken } from '../middleware/bootstrap.middleware';
import { validate } from '../middleware/validate.middleware';
import { GoogleAuthService } from '../services/google-auth.service';
import { UserType } from '../types';
import { ApiError, ErrorCodes } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';
import { ok } from '../utils/response.util';

import {
  appleAuthSchema,
  googleAuthSchema,
  loginSchema,
  registerStudentSchema,
  registerSuperAdminSchema,
  registerTeacherSchema,
  requestPasswordResetSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../schemas/auth.schemas';

const router = Router();

// =============================================================================
// Public — Registration
// =============================================================================

// Super-admin registration is gated by BOOTSTRAP_TOKEN. With no env var set
// the endpoint is 404 — see middleware/bootstrap.middleware.ts for rationale.
router.post(
  '/register/super-admin',
  requireBootstrapToken,
  validate({ body: registerSuperAdminSchema }),
  asyncHandler(AuthController.registerSuperAdmin)
);

// Direct teacher registration is now restricted to super-admins. The default
// path for any new teacher is the application flow under
// /api/teacher-applications (Phase 1) — super-admins retain this endpoint as
// an override for urgent or migrated accounts.
router.post(
  '/register/teacher',
  authenticateToken,
  requireRole(UserType.SUPER_ADMIN),
  validate({ body: registerTeacherSchema }),
  asyncHandler(AuthController.registerTeacher)
);

router.post(
  '/register/student',
  validate({ body: registerStudentSchema }),
  asyncHandler(AuthController.registerStudent)
);

// =============================================================================
// Public — Session
// =============================================================================

router.post(
  '/login',
  validate({ body: loginSchema }),
  asyncHandler(AuthController.login)
);

// =============================================================================
// Public — OAuth
// =============================================================================

router.post(
  '/google-auth',
  validate({ body: googleAuthSchema }),
  asyncHandler(AuthController.googleAuth)
);

router.post(
  '/apple-auth',
  validate({ body: appleAuthSchema }),
  asyncHandler(AuthController.appleAuth)
);

// Google OAuth web callback. Apple's equivalent lives in the controller
// because Apple sends form-encoded data with custom handling.
router.get(
  '/google/callback',
  asyncHandler(async (req, res) => {
    const code = req.query['code'] as string | undefined;
    if (!code) {
      throw new ApiError(400, 'Missing Google authorization code', ErrorCodes.INVALID_REQUEST);
    }

    // Throws ApiError on any Google failure.
    const result = await GoogleAuthService.exchangeCodeForTokens(code);
    res.status(200).json(
      ok({ user: result.user, tokens: result.tokens }, 'Google OAuth successful')
    );
  })
);

router.get('/apple-redirect', asyncHandler(AuthController.appleCallback));

// =============================================================================
// Public — Verification + Password Reset
// =============================================================================

router.post(
  '/verify-email',
  validate({ body: verifyEmailSchema }),
  asyncHandler(AuthController.verifyEmail)
);

router.post(
  '/resend-verification',
  validate({ body: resendVerificationSchema }),
  asyncHandler(AuthController.resendVerificationCode)
);

router.post(
  '/request-password-reset',
  validate({ body: requestPasswordResetSchema }),
  asyncHandler(AuthController.requestPasswordReset)
);

router.post(
  '/reset-password',
  validate({ body: resetPasswordSchema }),
  asyncHandler(AuthController.resetPassword)
);

// =============================================================================
// Authenticated
// =============================================================================
// completeProfile + updateProfile validate inside the controller because the
// schema depends on req.user.userType (which authenticateToken provides).

router.post('/logout', authenticateToken, asyncHandler(AuthController.logout));
router.post(
  '/complete-profile',
  authenticateToken,
  asyncHandler(AuthController.completeProfile)
);
router.post(
  '/update-profile',
  authenticateToken,
  asyncHandler(AuthController.updateProfile)
);

export default router;
