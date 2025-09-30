import { Router } from 'express';
import { authenticateToken, requireTeacher } from '@/middleware/auth.middleware';
import { TeacherNotificationController } from '@/controllers/teacher/notification.controller';

const router = Router();

router.use(authenticateToken, requireTeacher);

// GET /api/teacher/notifications
// query: page, limit, q, type, courseId
router.get('/', TeacherNotificationController.listMyNotifications);

export default router;
