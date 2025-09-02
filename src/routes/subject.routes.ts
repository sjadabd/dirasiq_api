import { SubjectController } from '@/controllers/subject.controller';
import { authenticateToken, requireTeacher } from '@/middleware/auth.middleware';
import { Router } from 'express';

const router = Router();

// All routes require authentication and teacher role
router.use(authenticateToken);
router.use(requireTeacher);

// Subject routes
router.post('/', SubjectController.create);
router.get('/', SubjectController.getAll);
router.get('/:id', SubjectController.getById);
router.put('/:id', SubjectController.update);
router.delete('/:id', SubjectController.delete);

export default router;
