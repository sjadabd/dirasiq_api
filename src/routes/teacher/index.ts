import { Router } from 'express';
import courseBookingRoutes from './course-booking.routes';
import courseRoutes from './course.routes';
import notificationRoutes from './notification.routes';
import rosterRoutes from './roster.routes';
import sessionRoutes from './session.routes';
import subjectRoutes from './subject.routes';
import assignmentRoutes from './assignment.routes';
import examRoutes from './exam.routes';

const router = Router();

// تطبيق المسارات
router.use('/courses', courseRoutes);
router.use('/subjects', subjectRoutes);
router.use('/bookings', courseBookingRoutes);
router.use('/sessions', sessionRoutes);
router.use('/notifications', notificationRoutes);
router.use('/students', rosterRoutes);
router.use('/roster', rosterRoutes);
router.use('/assignments', assignmentRoutes);
router.use('/exams', examRoutes);

export default router;
