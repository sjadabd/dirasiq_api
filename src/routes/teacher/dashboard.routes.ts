import { Router } from 'express';
import { TeacherDashboardController } from '../../controllers/teacher/dashboard.controller';
import {
  authenticateToken,
  requireTeacher,
} from '../../middleware/auth.middleware';

const router = Router();

// Require teacher authentication
router.use(authenticateToken);
router.use(requireTeacher);

// GET /api/teacher/dashboard
router.get('/', TeacherDashboardController.getDashboard);
// GET /api/teacher/dashboard/upcoming-today
router.get(
  '/upcoming-today',
  TeacherDashboardController.getTodayUpcomingSessions
);
// GET /api/teacher/dashboard/referrals
router.get('/referrals', TeacherDashboardController.getReferralStats);

export default router;
