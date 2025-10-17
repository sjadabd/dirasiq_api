import { Router } from 'express';
import { StudentCourseController } from '../../controllers/student/course.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

// Apply authentication middleware to all student routes
router.use(authenticateToken);

// Get suggested courses for student based on grade and location
router.get('/suggested', StudentCourseController.getSuggestedCourses);

// Get course details by ID
router.get('/:id', StudentCourseController.getCourseById);

export default router;
