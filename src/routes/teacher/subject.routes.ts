import { Router } from 'express';
import { SubjectController } from '../../controllers/teacher/subject.controller';
import { authenticateToken, requireTeacher } from '../../middleware/auth.middleware';

const router = Router();

// All routes require authentication and teacher role
router.use(authenticateToken);
router.use(requireTeacher);

// Subject routes
router.post('/', SubjectController.create);
router.get('/', SubjectController.getAll);
router.get('/all', SubjectController.getAllSubjects);
router.get('/:id', SubjectController.getById);
router.put('/:id', SubjectController.update);
router.delete('/:id', SubjectController.delete);

// Soft delete management routes
router.patch('/:id/restore', SubjectController.restore);
router.delete('/:id/hard', SubjectController.hardDelete);

export default router;
