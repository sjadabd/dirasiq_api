import { Router } from 'express';

import { TeacherDashboardController } from '../../controllers/teacher/dashboard.controller';
import { asyncHandler } from '../../utils/async-handler';

const router = Router();

router.get('/', asyncHandler(TeacherDashboardController.getDashboard));
router.get('/upcoming-today', asyncHandler(TeacherDashboardController.getTodayUpcomingSessions));
router.get('/referrals', asyncHandler(TeacherDashboardController.getReferralStats));

export default router;
