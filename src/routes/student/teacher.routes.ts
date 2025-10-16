import { Router } from 'express';
import { StudentTeacherController } from '../../controllers/student/teacher.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/suggested', StudentTeacherController.getSuggestedTeachers);
router.get('/:teacherId/subjects-courses', StudentTeacherController.getTeacherSubjectsAndCourses);

export default router;
