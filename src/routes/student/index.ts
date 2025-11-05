import { Router } from 'express';
import assignmentRoutes from './assignment.routes';
import attendanceRoutes from './attendance.routes';
import courseRoutes from './course.routes';
import courseBookingRoutes from './course-booking.routes';
import examRoutes from './exam.routes';
import enrollmentRoutes from './enrollment.routes';
import invoiceRoutes from './invoice.routes';
import studentEvaluationRoutes from './student-evaluation.routes';
import teacherRoutes from './teacher.routes';
import dashboardRoutes from './dashboard.routes';
import searchRoutes from './search.routes';
import { authenticateToken } from '../../middleware/auth.middleware';
import { UserType } from '../../types';
import { UserModel } from '../../models/user.model';

const router = Router();

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

router.delete('/account', authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.userType !== UserType.STUDENT) {
      res.status(403).json({ success: false, message: 'الوصول مرفوض', errors: ['مسموح للطلاب فقط'] });
      return;
    }

    const ok = await UserModel.delete(req.user.id);
    if (!ok) {
      res.status(400).json({ success: false, message: 'فشل حذف الحساب', errors: ['تعذر حذف الحساب'] });
      return;
    }

    res.status(200).json({ success: true, message: 'تم حذف الحساب بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم', errors: ['خطأ داخلي في الخادم'] });
  }
});

export default router;

