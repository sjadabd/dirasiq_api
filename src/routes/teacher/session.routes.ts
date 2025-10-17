import { Router } from 'express';
import { TeacherRosterController } from '../../controllers/teacher/roster.controller';
import { TeacherSessionController } from '../../controllers/teacher/session.controller';
import { authenticateToken, requireTeacher } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken, requireTeacher);

router.post('/', TeacherSessionController.createSession);
router.get('/', TeacherSessionController.listMySessions);
router.get('/names', TeacherRosterController.listSessionNames);
router.get('/courses/:courseId/confirmed-students', TeacherSessionController.getConfirmedStudentsByCourse);
router.get('/:id/attendees', TeacherSessionController.listAttendees);
router.post('/:id/attendees', TeacherSessionController.addAttendees);
router.delete('/:id/attendees', TeacherSessionController.removeAttendees);
router.get('/:id/attendance', TeacherSessionController.getSessionAttendanceByDate);
router.post('/:id/attendance', TeacherSessionController.bulkSetSessionAttendance);
router.put('/:id', TeacherSessionController.updateSession);
router.delete('/:id', TeacherSessionController.deleteSession);
router.post('/:id/end', TeacherSessionController.endSessionAndNotify);

export default router;
