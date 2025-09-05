import { TeacherCourseEnrollmentController } from '@/controllers/teacher/course-enrollment.controller';
import { authenticateToken } from '@/middleware/auth.middleware';
import { CourseEnrollmentRequestModel } from '@/models/course-enrollment-request.model';
import { CourseInvoiceModel } from '@/models/course-invoice.model';
import { PaymentInstallmentModel } from '@/models/payment-installment.model';
import { StudentCourseEnrollmentModel } from '@/models/student-course-enrollment.model';
import { CourseEnrollmentService } from '@/services/course-enrollment.service';
import { Router } from 'express';
import { Pool } from 'pg';

const router = Router();

// إنشاء النماذج
const pool = new Pool({
  connectionString: process.env['DATABASE_URL'],
});

const enrollmentRequestModel = new CourseEnrollmentRequestModel(pool);
const enrollmentModel = new StudentCourseEnrollmentModel(pool);
const invoiceModel = new CourseInvoiceModel(pool);
const installmentModel = new PaymentInstallmentModel(pool);

// إنشاء الخدمة
const enrollmentService = new CourseEnrollmentService(
  enrollmentRequestModel,
  enrollmentModel,
  invoiceModel,
  installmentModel
);

// إنشاء المتحكم
const controller = new TeacherCourseEnrollmentController(enrollmentService);

// تطبيق middleware المصادقة على جميع المسارات
router.use(authenticateToken);

// =====================================================
// مسارات طلبات التسجيل
// =====================================================

/**
 * @route GET /api/teacher/enrollment-requests
 * @desc الحصول على جميع طلبات التسجيل للمعلم
 * @access Teacher
 */
router.get('/enrollment-requests', controller.getEnrollmentRequests.bind(controller));

/**
 * @route GET /api/teacher/enrollment-requests/:id
 * @desc الحصول على طلب تسجيل محدد
 * @access Teacher
 */
router.get('/enrollment-requests/:id', controller.getEnrollmentRequest.bind(controller));

/**
 * @route PUT /api/teacher/enrollment-requests/:id/approve
 * @desc الموافقة على طلب التسجيل
 * @access Teacher
 */
router.put('/enrollment-requests/:id/approve', controller.approveEnrollmentRequest.bind(controller));

/**
 * @route PUT /api/teacher/enrollment-requests/:id/reject
 * @desc رفض طلب التسجيل
 * @access Teacher
 */
router.put('/enrollment-requests/:id/reject', controller.rejectEnrollmentRequest.bind(controller));

// =====================================================
// مسارات التسجيلات
// =====================================================

/**
 * @route GET /api/teacher/enrollments
 * @desc الحصول على جميع تسجيلات المعلم
 * @access Teacher
 */
router.get('/enrollments', controller.getEnrollments.bind(controller));

/**
 * @route GET /api/teacher/enrollments/:id
 * @desc الحصول على تسجيل محدد
 * @access Teacher
 */
router.get('/enrollments/:id', controller.getEnrollment.bind(controller));

/**
 * @route PUT /api/teacher/enrollments/:id/status
 * @desc تحديث حالة التسجيل
 * @access Teacher
 */
router.put('/enrollments/:id/status', controller.updateEnrollmentStatus.bind(controller));

// =====================================================
// مسارات الفواتير
// =====================================================

/**
 * @route POST /api/teacher/invoices/reservation
 * @desc إنشاء فاتورة حجز
 * @access Teacher
 */
router.post('/invoices/reservation', controller.createReservationInvoice.bind(controller));

/**
 * @route POST /api/teacher/invoices/course
 * @desc إنشاء فاتورة كورس
 * @access Teacher
 */
router.post('/invoices/course', controller.createCourseInvoice.bind(controller));

/**
 * @route POST /api/teacher/invoices/bulk
 * @desc إنشاء فواتير متعددة
 * @access Teacher
 */
router.post('/invoices/bulk', controller.createBulkInvoices.bind(controller));

/**
 * @route GET /api/teacher/invoices
 * @desc الحصول على جميع فواتير المعلم
 * @access Teacher
 */
router.get('/invoices', controller.getInvoices.bind(controller));

/**
 * @route GET /api/teacher/invoices/:id
 * @desc الحصول على فاتورة محددة
 * @access Teacher
 */
router.get('/invoices/:id', controller.getInvoice.bind(controller));

/**
 * @route PUT /api/teacher/invoices/:id
 * @desc تحديث الفاتورة
 * @access Teacher
 */
router.put('/invoices/:id', controller.updateInvoice.bind(controller));

/**
 * @route PUT /api/teacher/invoices/:id/payment
 * @desc تحديث المدفوعات
 * @access Teacher
 */
router.put('/invoices/:id/payment', controller.updatePayment.bind(controller));

// =====================================================
// مسارات لوحة التحكم
// =====================================================

/**
 * @route GET /api/teacher/dashboard
 * @desc الحصول على بيانات لوحة تحكم المعلم
 * @access Teacher
 */
router.get('/dashboard', controller.getDashboard.bind(controller));

export default router;
