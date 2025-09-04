import { StudentCourseEnrollmentController } from '@/controllers/student/course-enrollment.controller';
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
const controller = new StudentCourseEnrollmentController(enrollmentService);

// تطبيق middleware المصادقة على جميع المسارات
router.use(authenticateToken);

// =====================================================
// مسارات طلبات التسجيل
// =====================================================

/**
 * @route POST /api/student/enrollment-requests
 * @desc إنشاء طلب تسجيل جديد في كورس
 * @access Student
 */
router.post('/enrollment-requests', controller.createEnrollmentRequest.bind(controller));

/**
 * @route GET /api/student/enrollment-requests
 * @desc الحصول على جميع طلبات التسجيل للطالب
 * @access Student
 */
router.get('/enrollment-requests', controller.getMyEnrollmentRequests.bind(controller));

/**
 * @route GET /api/student/enrollment-requests/:id
 * @desc الحصول على طلب تسجيل محدد
 * @access Student
 */
router.get('/enrollment-requests/:id', controller.getEnrollmentRequest.bind(controller));

/**
 * @route DELETE /api/student/enrollment-requests/:id
 * @desc حذف طلب التسجيل
 * @access Student
 */
router.delete('/enrollment-requests/:id', controller.deleteEnrollmentRequest.bind(controller));

// =====================================================
// مسارات التسجيلات
// =====================================================

/**
 * @route GET /api/student/enrollments
 * @desc الحصول على جميع تسجيلات الطالب
 * @access Student
 */
router.get('/enrollments', controller.getMyEnrollments.bind(controller));

/**
 * @route GET /api/student/enrollments/:id
 * @desc الحصول على تسجيل محدد
 * @access Student
 */
router.get('/enrollments/:id', controller.getEnrollment.bind(controller));

// =====================================================
// مسارات الفواتير
// =====================================================

/**
 * @route GET /api/student/invoices
 * @desc الحصول على جميع فواتير الطالب
 * @access Student
 */
router.get('/invoices', controller.getMyInvoices.bind(controller));

/**
 * @route GET /api/student/invoices/:id
 * @desc الحصول على فاتورة محددة
 * @access Student
 */
router.get('/invoices/:id', controller.getInvoice.bind(controller));

/**
 * @route PUT /api/student/invoices/:id/payment
 * @desc تحديث المدفوعات
 * @access Student
 */
router.put('/invoices/:id/payment', controller.updatePayment.bind(controller));

// =====================================================
// مسارات لوحة التحكم
// =====================================================

/**
 * @route GET /api/student/dashboard
 * @desc الحصول على بيانات لوحة تحكم الطالب
 * @access Student
 */
router.get('/dashboard', controller.getDashboard.bind(controller));

export default router;
