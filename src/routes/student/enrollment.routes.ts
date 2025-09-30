import { StudentEnrollmentController } from '@/controllers/student/enrollment.controller';
import { authenticateToken } from '@/middleware/auth.middleware';
import { Router } from 'express';

const router = Router();

router.use(authenticateToken);

// Get courses the student is enrolled in for the active academic year
router.get('/', StudentEnrollmentController.getMyEnrolledCourses);

// Get student's weekly schedule
router.get('/schedule', StudentEnrollmentController.getWeeklySchedule);

// Get comprehensive weekly schedule (alias)
router.get('/schedule/weekly', StudentEnrollmentController.getWeeklyScheduleComprehensive);

// Get weekly schedule for a specific course
router.get('/schedule/weekly/by-course/:courseId', StudentEnrollmentController.getWeeklyScheduleByCourse);

export default router;
