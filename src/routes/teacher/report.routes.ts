import { Router } from 'express';
import { TeacherReportController } from '../../controllers/teacher/report.controller';
import { authenticateToken, requireTeacher } from '../../middleware/auth.middleware';

const router = Router();

router.get('/financial', authenticateToken, requireTeacher, TeacherReportController.financial);

export default router;
