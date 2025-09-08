import { CourseController } from '@/controllers/teacher/course.controller';
import { authenticateToken, requireTeacher } from '@/middleware/auth.middleware';
import { Router } from 'express';

const router = Router();

// All routes require authentication and teacher role
router.use(authenticateToken);
router.use(requireTeacher);

// Course routes
router.post('/', CourseController.create);
router.get('/', CourseController.getAll);
router.get('/deleted-not-expired', CourseController.getDeletedNotExpired);
router.get('/:id', CourseController.getById);
router.put('/:id', CourseController.update);
router.delete('/:id', CourseController.delete);
router.patch('/:id/restore', CourseController.restore);

export default router;
