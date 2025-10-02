import { Router } from 'express';
import { authenticateToken, requireStudent } from '@/middleware/auth.middleware';
import { StudentExamController } from '@/controllers/student/exam.controller';

const router = Router();

router.get('/', authenticateToken, requireStudent, StudentExamController.list);
router.get('/:id', authenticateToken, requireStudent, StudentExamController.getById);
router.get('/:id/my-grade', authenticateToken, requireStudent, StudentExamController.myGrade);
router.get('/report/by-type', authenticateToken, requireStudent, StudentExamController.report);

export default router;
