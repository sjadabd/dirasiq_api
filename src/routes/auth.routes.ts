import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { GoogleAuthService } from '../services/google-auth.service';

const router = Router();

// Public routes (no authentication required)
router.post('/register/super-admin', AuthController.registerSuperAdmin);
router.post('/register/teacher', AuthController.registerTeacher);
router.post('/register/student', AuthController.registerStudent);
router.post('/login', AuthController.login);
router.post('/google-auth', AuthController.googleAuth);
router.post('/verify-email', AuthController.verifyEmail);
router.post('/resend-verification', AuthController.resendVerificationCode);
router.post('/request-password-reset', AuthController.requestPasswordReset);
router.post('/reset-password', AuthController.resetPassword);
// ✅ Google OAuth callback (للتوافق مع إعدادات Google Console)
router.get('/google/callback', async (req, res) => {
  const code = req.query['code'] as string | undefined;

  if (!code) {
    return res.status(400).json({
      success: false,
      message: 'Missing Google authorization code',
    });
  }

  const result = await GoogleAuthService.exchangeCodeForTokens(code);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: 'Failed to exchange Google code',
      error: result.error,
    });
  }

  return res.status(200).json({
    success: true,
    message: '✅ Google OAuth successful',
    user: result.user,
    tokens: result.tokens,
  });
});


// Protected routes (authentication required)
router.post('/logout', authenticateToken, AuthController.logout);
router.post('/complete-profile', authenticateToken, AuthController.completeProfile);
router.post('/update-profile', authenticateToken, AuthController.updateProfile);

export default router;
