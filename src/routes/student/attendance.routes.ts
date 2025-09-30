import { Router } from 'express';
import { authenticateToken, requireStudent } from '@/middleware/auth.middleware';
import { StudentAttendanceController } from '@/controllers/student/attendance.controller';

const router = Router();

router.use(authenticateToken, requireStudent);

// POST /api/student/attendance/check-in
router.post('/check-in', StudentAttendanceController.checkIn);

export default router;
