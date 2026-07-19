import { Router } from 'express';

import { TeacherDashboardController } from '../../controllers/teacher/dashboard.controller';
import { asyncHandler } from '../../utils/async-handler';

const router = Router();

router.get('/', asyncHandler(TeacherDashboardController.getDashboard));
router.get('/upcoming-today', asyncHandler(TeacherDashboardController.getTodayUpcomingSessions));
router.get('/performance', asyncHandler(TeacherDashboardController.getPerformance));
router.get('/activity', asyncHandler(TeacherDashboardController.getRecentActivity));
router.get('/referrals', asyncHandler(TeacherDashboardController.getReferralStats));

export default router;
