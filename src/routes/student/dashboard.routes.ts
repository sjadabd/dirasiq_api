import { Router } from 'express';
import { authenticateToken } from '@/middleware/auth.middleware';
import { StudentDashboardController } from '@/controllers/student/dashboard.controller';

const router = Router();

router.use(authenticateToken);

router.get('/overview', StudentDashboardController.getOverview);
router.get('/weekly-schedule', StudentDashboardController.getWeeklySchedule);

export default router;
