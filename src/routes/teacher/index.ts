import { Router } from 'express';
import courseRoutes from './course.routes';
import subjectRoutes from './subject.routes';

const router = Router();

// تطبيق المسارات
router.use('/courses', courseRoutes);
router.use('/subjects', subjectRoutes);

export default router;
