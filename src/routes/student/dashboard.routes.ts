import { Router } from 'express';
import { StudentDashboardController } from '../../controllers/student/dashboard.controller';
import { asyncHandler } from '../../utils/async-handler';

const router = Router();

router.get('/overview', asyncHandler(StudentDashboardController.getOverview));
router.get('/weekly-schedule', asyncHandler(StudentDashboardController.getWeeklySchedule));

export default router;
