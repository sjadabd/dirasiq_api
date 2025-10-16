import { Router } from 'express';
import { TeacherExpenseController } from '../../controllers/teacher/expense.controller';
import { authenticateToken, requireTeacher } from '../../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, requireTeacher, TeacherExpenseController.create);
router.get('/', authenticateToken, requireTeacher, TeacherExpenseController.list);
router.patch('/:id', authenticateToken, requireTeacher, TeacherExpenseController.update);
router.delete('/:id', authenticateToken, requireTeacher, TeacherExpenseController.remove);

export default router;
