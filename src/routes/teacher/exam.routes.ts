import { Router } from 'express';
import { authenticateToken, requireTeacher } from '@/middleware/auth.middleware';
import { TeacherExamController } from '@/controllers/teacher/exam.controller';

const router = Router();

router.post('/', authenticateToken, requireTeacher, TeacherExamController.create);
router.get('/', authenticateToken, requireTeacher, TeacherExamController.list);
router.get('/:id', authenticateToken, requireTeacher, TeacherExamController.getById);
router.patch('/:id', authenticateToken, requireTeacher, TeacherExamController.update);
router.delete('/:id', authenticateToken, requireTeacher, TeacherExamController.remove);
router.get('/:id/students', authenticateToken, requireTeacher, TeacherExamController.students);
router.put('/:examId/grade/:studentId', authenticateToken, requireTeacher, TeacherExamController.grade);

export default router;
