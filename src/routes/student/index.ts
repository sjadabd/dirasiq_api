// Student router.
//
// Phase 1.B-2 invariant: every endpoint under /api/student/* requires
// authentication + the student role. Both are applied at this level so each
// sub-route file no longer needs `authenticateToken, requireStudent` per
// handler.

import { Router } from 'express';

import assignmentRoutes from './assignment.routes';
import attendanceRoutes from './attendance.routes';
import courseRoutes from './course.routes';
import courseBookingRoutes from './course-booking.routes';
import dashboardRoutes from './dashboard.routes';
import enrollmentRoutes from './enrollment.routes';
import examRoutes from './exam.routes';
import invoiceRoutes from './invoice.routes';
import searchRoutes from './search.routes';
import studentEvaluationRoutes from './student-evaluation.routes';
import teacherRoutes from './teacher.routes';
import videoCourseRoutes from './video-course.routes';
import videoCourseProxyRoutes from './video-course-proxy.routes';
import contentFeedRoutes from './content-feed.routes';

import { authenticateToken, requireRole } from '../../middleware/auth.middleware';
import { UserType } from '../../types';

const router = Router();

// HLS manifest proxy is mounted BEFORE the auth middleware: it carries its
// own HMAC ticket (PlaybackTicketService) because HLS players cannot reliably
// attach a JWT to every segment fetch. Requests that don't match a proxy
// route fall through to the auth gate below — there's no path overlap with
// the authenticated video-course routes (proxy uses /manifest.m3u8 and
// /variants/:quality/video.m3u8 only).
router.use('/video-courses', videoCourseProxyRoutes);

router.use(authenticateToken, requireRole(UserType.STUDENT));

router.use('/assignments', assignmentRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/courses', courseRoutes);
router.use('/course-bookings', courseBookingRoutes);
router.use('/bookings', courseBookingRoutes);
router.use('/exams', examRoutes);
router.use('/enrollment', enrollmentRoutes);
router.use('/enrollments', enrollmentRoutes);
router.use('/evaluations', studentEvaluationRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/teachers', teacherRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/search', searchRoutes);
router.use('/', contentFeedRoutes);
router.use('/video-courses', videoCourseRoutes);

export default router;
