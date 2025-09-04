import { Router } from 'express';
import courseEnrollmentRoutes from './course-enrollment.routes';
import courseRoutes from './course.routes';
import subjectRoutes from './subject.routes';

const router = Router();

// تطبيق المسارات
router.use('/courses', courseRoutes);
router.use('/subjects', subjectRoutes);
router.use('/', courseEnrollmentRoutes);

export default router;
