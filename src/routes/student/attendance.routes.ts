import { Router } from 'express';
import { StudentAttendanceController } from '../../controllers/student/attendance.controller';
import { authenticateToken, requireStudent } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken, requireStudent);

// POST /api/student/attendance/check-in
router.post('/check-in', StudentAttendanceController.checkIn);

// GET /api/student/attendance/by-course/:courseId
router.get('/by-course/:courseId', StudentAttendanceController.getMyAttendanceByCourse);

export default router;
