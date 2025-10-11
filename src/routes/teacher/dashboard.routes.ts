import { Router } from 'express';
import { authenticateToken, requireTeacher } from '@/middleware/auth.middleware';
import { TeacherDashboardController } from '@/controllers/teacher/dashboard.controller';

const router = Router();

// Require teacher authentication
router.use(authenticateToken);
router.use(requireTeacher);

// GET /api/teacher/dashboard
router.get('/', TeacherDashboardController.getDashboard);
// GET /api/teacher/dashboard/upcoming-today
router.get('/upcoming-today', TeacherDashboardController.getTodayUpcomingSessions);

export default router;
