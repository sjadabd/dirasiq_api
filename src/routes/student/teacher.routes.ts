import { Router } from 'express';
import { authenticateToken } from '@/middleware/auth.middleware';
import { StudentTeacherController } from '@/controllers/student/teacher.controller';

const router = Router();

router.use(authenticateToken);

router.get('/suggested', StudentTeacherController.getSuggestedTeachers);
router.get('/:teacherId/subjects-courses', StudentTeacherController.getTeacherSubjectsAndCourses);

export default router;
