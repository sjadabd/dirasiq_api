import { Router } from 'express';
import { TeacherAcademicYearController } from '../../controllers/teacher/academic-year.controller';
import { authenticateToken, requireTeacher } from '../../middleware/auth.middleware';

const router = Router();

router.get('/', authenticateToken, requireTeacher, TeacherAcademicYearController.list);

export default router;
