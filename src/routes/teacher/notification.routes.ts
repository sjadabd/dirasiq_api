import { Router } from 'express';
import { TeacherNotificationController } from '../../controllers/teacher/notification.controller';
import { authenticateToken, requireTeacher } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken, requireTeacher);

// GET /api/teacher/notifications
// query: page, limit, q, type, courseId
router.get('/', TeacherNotificationController.listMyNotifications);

// POST /api/teacher/notifications
router.post('/', TeacherNotificationController.createNotification);

// DELETE /api/teacher/notifications/:id (soft delete)
router.delete('/:id', TeacherNotificationController.deleteNotification);

export default router;
