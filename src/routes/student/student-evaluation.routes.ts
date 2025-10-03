import { Router } from 'express';
import { authenticateToken, requireStudent } from '@/middleware/auth.middleware';
import { StudentStudentEvaluationController } from '@/controllers/student/student-evaluation.controller';

const router = Router();

router.get('/', authenticateToken, requireStudent, StudentStudentEvaluationController.list);
router.get('/:id', authenticateToken, requireStudent, StudentStudentEvaluationController.getById);

export default router;
