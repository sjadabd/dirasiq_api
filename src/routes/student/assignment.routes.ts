import { Router } from 'express';
import { StudentAssignmentController } from '../../controllers/student/assignment.controller';
import { authenticateToken, requireStudent } from '../../middleware/auth.middleware';

const router = Router();

router.get('/', authenticateToken, requireStudent, StudentAssignmentController.list);
router.get('/:id', authenticateToken, requireStudent, StudentAssignmentController.getById);
router.get('/:id/submission', authenticateToken, requireStudent, StudentAssignmentController.mySubmission);
router.post('/:id/submit', authenticateToken, requireStudent, StudentAssignmentController.submit);

export default router;
