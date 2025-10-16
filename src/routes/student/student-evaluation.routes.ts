import { Router } from 'express';
import { StudentStudentEvaluationController } from '../../controllers/student/student-evaluation.controller';
import { authenticateToken, requireStudent } from '../../middleware/auth.middleware';

const router = Router();

router.get('/', authenticateToken, requireStudent, StudentStudentEvaluationController.list);
router.get('/:id', authenticateToken, requireStudent, StudentStudentEvaluationController.getById);

export default router;
