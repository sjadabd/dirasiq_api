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

import { authenticateToken, requireRole } from '../../middleware/auth.middleware';
import { UserType } from '../../types';
import { UserModel } from '../../models/user.model';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { asyncHandler } from '../../utils/async-handler';
import { okEmpty } from '../../utils/response.util';

const router = Router();

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

// Self-service account deletion (student only — enforced by the router-level
// requireRole above). The legacy inline handler used to live here; migrated to
// the Phase 1 envelope.
router.delete(
  '/account',
  asyncHandler(async (req, res) => {
    const studentId = req.user.id as string;
    const success = await UserModel.delete(studentId);
    if (!success) {
      throw new ApiError(400, 'تعذر حذف الحساب', ErrorCodes.INVALID_REQUEST);
    }
    res.status(200).json(okEmpty('تم حذف الحساب بنجاح'));
  })
);

export default router;
