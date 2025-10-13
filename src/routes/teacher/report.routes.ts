import { Router } from 'express';
import { authenticateToken, requireTeacher } from '@/middleware/auth.middleware';
import { TeacherReportController } from '@/controllers/teacher/report.controller';

const router = Router();

router.get('/financial', authenticateToken, requireTeacher, TeacherReportController.financial);

export default router;
