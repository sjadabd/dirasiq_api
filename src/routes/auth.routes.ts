import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';

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

// Protected routes (authentication required)
router.post('/logout', authenticateToken, AuthController.logout);
router.post('/complete-profile', authenticateToken, AuthController.completeProfile);
router.post('/update-profile', authenticateToken, AuthController.updateProfile);

export default router;
