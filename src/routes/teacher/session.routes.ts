import { Router } from 'express';
import { authenticateToken, requireTeacher } from '@/middleware/auth.middleware';
import { TeacherSessionController } from '@/controllers/teacher/session.controller';

const router = Router();

router.use(authenticateToken, requireTeacher);

router.post('/', TeacherSessionController.createSession);
router.get('/', TeacherSessionController.listMySessions);
router.get('/:id/attendees', TeacherSessionController.listAttendees);
router.post('/:id/attendees', TeacherSessionController.addAttendees);
router.delete('/:id/attendees', TeacherSessionController.removeAttendees);
router.put('/:id', TeacherSessionController.updateSession);
router.delete('/:id', TeacherSessionController.deleteSession);
router.post('/:id/end', TeacherSessionController.endSessionAndNotify);

export default router;
