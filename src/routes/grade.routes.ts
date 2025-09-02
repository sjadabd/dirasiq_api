import { GradeController } from '@/controllers/grade.controller';
import { authenticateToken, requireTeacher } from '@/middleware/auth.middleware';
import { Router } from 'express';

const router = Router();

// All routes require authentication and teacher role
router.use(authenticateToken);
router.use(requireTeacher);

// Grade routes
router.post('/', GradeController.create);
router.get('/', GradeController.getAll);
router.get('/:id', GradeController.getById);
router.put('/:id', GradeController.update);
router.delete('/:id', GradeController.delete);

export default router;
