import { Router } from 'express';
import { TeacherAssignmentController } from '../../controllers/teacher/assignment.controller';
import { authenticateToken, requireTeacher } from '../../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, requireTeacher, TeacherAssignmentController.create);
router.get('/', authenticateToken, requireTeacher, TeacherAssignmentController.list);
router.get('/:id', authenticateToken, requireTeacher, TeacherAssignmentController.getById);
router.get('/:id/overview', authenticateToken, requireTeacher, TeacherAssignmentController.overview);
router.get('/:id/students', authenticateToken, requireTeacher, TeacherAssignmentController.students);
router.patch('/:id', authenticateToken, requireTeacher, TeacherAssignmentController.update);
router.delete('/:id', authenticateToken, requireTeacher, TeacherAssignmentController.remove);
router.put('/:id/recipients', authenticateToken, requireTeacher, TeacherAssignmentController.setRecipients);
router.put('/:assignmentId/grade/:studentId', authenticateToken, requireTeacher, TeacherAssignmentController.grade);
router.get('/:id/recipients', authenticateToken, requireTeacher, TeacherAssignmentController.recipients);
router.get('/:assignmentId/submission/:studentId', authenticateToken, requireTeacher, TeacherAssignmentController.getStudentSubmission);

export default router;
