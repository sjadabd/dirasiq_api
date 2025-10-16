import { Router } from 'express';
import { StudentDashboardController } from '../../controllers/student/dashboard.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/overview', StudentDashboardController.getOverview);
router.get('/weekly-schedule', StudentDashboardController.getWeeklySchedule);

export default router;
