import { Router } from 'express';
import { TeacherRosterController } from '../../controllers/teacher/roster.controller';
import { authenticateToken, requireTeacher } from '../../middleware/auth.middleware';

const router = Router();
router.use(authenticateToken, requireTeacher);

// Students
router.get('/', TeacherRosterController.listAllStudents); // /api/teacher/students
router.get('/by-course/:courseId', TeacherRosterController.listStudentsByCourse);
router.get('/by-session/:sessionId', TeacherRosterController.listStudentsBySession);

// Sessions (names/time/day)
router.get('/sessions/names', TeacherRosterController.listSessionNames); // also mounted under /roster

// Courses (id + name)
router.get('/courses/names', TeacherRosterController.listCourseNames); // also mounted under /roster

export default router;
