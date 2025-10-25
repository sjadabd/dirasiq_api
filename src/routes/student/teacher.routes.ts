import { Router } from 'express';
import { StudentTeacherController } from '../../controllers/student/teacher.controller';
import { authenticateToken } from '../../middleware/auth.middleware';
import { TeacherProfileController } from '../../controllers/teacher/profile.controller';

const router = Router();

router.use(authenticateToken);

router.get('/suggested', StudentTeacherController.getSuggestedTeachers);
router.get('/:teacherId/subjects-courses', StudentTeacherController.getTeacherSubjectsAndCourses);
router.get('/:teacherId/intro-video', TeacherProfileController.getTeacherIntroVideo);

export default router;
