import { Router } from 'express';
import { authenticateToken, requireTeacher } from '@/middleware/auth.middleware';
import { TeacherAcademicYearController } from '@/controllers/teacher/academic-year.controller';

const router = Router();

router.get('/', authenticateToken, requireTeacher, TeacherAcademicYearController.list);

export default router;
