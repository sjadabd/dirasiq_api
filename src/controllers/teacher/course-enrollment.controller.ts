import { CourseEnrollmentService } from '@/services/course-enrollment.service';
import { UserType } from '@/types';
import { getMessage } from '@/utils/messages';
import { Request, Response } from 'express';

// تعريف نوع المستخدم الموسع
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    userType: UserType;
  };
}

export class TeacherCourseEnrollmentController {
  private enrollmentService: CourseEnrollmentService;

  constructor(enrollmentService: CourseEnrollmentService) {
    this.enrollmentService = enrollmentService;
  }

  /**
   * الحصول على طلبات التسجيل للمعلم
   */
  async getEnrollmentRequests(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId || req.user?.userType !== UserType.TEACHER) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.TEACHER_ACCESS_REQUIRED')
        });
        return;
      }

      const { page, limit, search, sortBy } = req.query;
      const params = {
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 10,
        search: search as string,
        sortBy: sortBy ? JSON.parse(sortBy as string) : undefined
      };

      const result = await this.enrollmentService.getEnrollmentRequests(teacherId, params);

      res.status(200).json({
        success: true,
        message: getMessage('ENROLLMENT_REQUEST.CREATED'),
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Error getting enrollment requests:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : getMessage('SERVER.SOMETHING_WENT_WRONG')
      });
    }
  }

  /**
   * الحصول على طلب تسجيل واحد
   */
  async getEnrollmentRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId || req.user?.userType !== UserType.TEACHER) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.TEACHER_ACCESS_REQUIRED')
        });
        return;
      }

      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          message: 'معرف الطلب مطلوب'
        });
        return;
      }

      const request = await this.enrollmentService.getEnrollmentRequest(id);
      if (!request) {
        res.status(404).json({
          success: false,
          message: getMessage('ENROLLMENT_REQUEST.NOT_FOUND')
        });
        return;
      }

      // التحقق من أن الطلب يخص المعلم
      if (request.teacherId !== teacherId) {
        res.status(403).json({
          success: false,
          message: getMessage('ENROLLMENT_REQUEST.UNAUTHORIZED')
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: getMessage('ENROLLMENT_REQUEST.CREATED'),
        data: request
      });
    } catch (error) {
      console.error('Error getting enrollment request:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : getMessage('SERVER.SOMETHING_WENT_WRONG')
      });
    }
  }

  /**
   * الموافقة على طلب التسجيل
   */
  async approveEnrollmentRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId || req.user?.userType !== UserType.TEACHER) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.TEACHER_ACCESS_REQUIRED')
        });
        return;
      }

      const { id } = req.params;
      const { courseStartDate, courseEndDate, totalCourseAmount, reservationAmount } = req.body;

      if (!id || !courseStartDate || !courseEndDate || !totalCourseAmount) {
        res.status(400).json({
          success: false,
          message: getMessage('ENROLLMENT.COURSE_START_DATE_REQUIRED')
        });
        return;
      }

      const result = await this.enrollmentService.approveEnrollmentRequest(
        id,
        teacherId,
        {
          courseStartDate,
          courseEndDate,
          totalCourseAmount,
          reservationAmount
        }
      );

      res.status(200).json(result);
    } catch (error) {
      console.error('Error approving enrollment request:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : getMessage('SERVER.SOMETHING_WENT_WRONG')
      });
    }
  }

  /**
   * رفض طلب التسجيل
   */
  async rejectEnrollmentRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId || req.user?.userType !== UserType.TEACHER) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.TEACHER_ACCESS_REQUIRED')
        });
        return;
      }

      const { id } = req.params;
      const { reason } = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'معرف الطلب مطلوب'
        });
        return;
      }

      const result = await this.enrollmentService.rejectEnrollmentRequest(
        id,
        teacherId,
        reason || 'تم رفض الطلب'
      );

      res.status(200).json(result);
    } catch (error) {
      console.error('Error rejecting enrollment request:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : getMessage('SERVER.SOMETHING_WENT_WRONG')
      });
    }
  }

  /**
   * الحصول على تسجيلات المعلم
   */
  async getEnrollments(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId || req.user?.userType !== UserType.TEACHER) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.TEACHER_ACCESS_REQUIRED')
        });
        return;
      }

      const { page, limit, search, sortBy } = req.query;
      const params = {
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 10,
        search: search as string,
        sortBy: sortBy ? JSON.parse(sortBy as string) : undefined
      };

      const result = await this.enrollmentService.getEnrollments(teacherId, params);

      res.status(200).json({
        success: true,
        message: getMessage('ENROLLMENT.CREATED'),
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Error getting enrollments:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : getMessage('SERVER.SOMETHING_WENT_WRONG')
      });
    }
  }

  /**
   * الحصول على تسجيل محدد
   */
  async getEnrollment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId || req.user?.userType !== UserType.TEACHER) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.TEACHER_ACCESS_REQUIRED')
        });
        return;
      }

      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          message: 'معرف التسجيل مطلوب'
        });
        return;
      }

      const enrollment = await this.enrollmentService.getEnrollment(id);
      if (!enrollment) {
        res.status(404).json({
          success: false,
          message: getMessage('ENROLLMENT.NOT_FOUND')
        });
        return;
      }

      // التحقق من أن التسجيل يخص المعلم
      if (enrollment.teacherId !== teacherId) {
        res.status(403).json({
          success: false,
          message: getMessage('ENROLLMENT.UNAUTHORIZED')
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: getMessage('ENROLLMENT.CREATED'),
        data: enrollment
      });
    } catch (error) {
      console.error('Error getting enrollment:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : getMessage('SERVER.SOMETHING_WENT_WRONG')
      });
    }
  }

  /**
   * تحديث حالة التسجيل
   */
  async updateEnrollmentStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId || req.user?.userType !== UserType.TEACHER) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.TEACHER_ACCESS_REQUIRED')
        });
        return;
      }

      const { id } = req.params;
      const { status } = req.body;

      if (!id || !status) {
        res.status(400).json({
          success: false,
          message: 'حالة التسجيل مطلوبة'
        });
        return;
      }

      const result = await this.enrollmentService.updateEnrollmentStatus(id, teacherId, status);

      res.status(200).json(result);
    } catch (error) {
      console.error('Error updating enrollment status:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : getMessage('SERVER.SOMETHING_WENT_WRONG')
      });
    }
  }

  /**
   * إنشاء فاتورة حجز
   */
  async createReservationInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId || req.user?.userType !== UserType.TEACHER) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.TEACHER_ACCESS_REQUIRED')
        });
        return;
      }

      const { enrollmentId, reservationAmount, dueDate } = req.body;

      if (!enrollmentId || !reservationAmount || !dueDate) {
        res.status(400).json({
          success: false,
          message: 'جميع الحقول مطلوبة'
        });
        return;
      }

      const result = await this.enrollmentService.createReservationInvoice(
        enrollmentId,
        teacherId,
        reservationAmount,
        dueDate
      );

      res.status(201).json(result);
    } catch (error) {
      console.error('Error creating reservation invoice:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : getMessage('SERVER.SOMETHING_WENT_WRONG')
      });
    }
  }

  /**
   * إنشاء فاتورة كورس
   */
  async createCourseInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId || req.user?.userType !== UserType.TEACHER) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.TEACHER_ACCESS_REQUIRED')
        });
        return;
      }

      const { enrollmentId, courseAmount, dueDate, notes } = req.body;

      if (!enrollmentId || !courseAmount || !dueDate) {
        res.status(400).json({
          success: false,
          message: 'الحقول الأساسية مطلوبة'
        });
        return;
      }

      const result = await this.enrollmentService.createCourseInvoice(
        enrollmentId,
        teacherId,
        courseAmount,
        dueDate,
        notes
      );

      res.status(201).json(result);
    } catch (error) {
      console.error('Error creating course invoice:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : getMessage('SERVER.SOMETHING_WENT_WRONG')
      });
    }
  }

  /**
   * إنشاء فواتير متعددة
   */
  async createBulkInvoices(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId || req.user?.userType !== UserType.TEACHER) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.TEACHER_ACCESS_REQUIRED')
        });
        return;
      }

      const { enrollmentIds, invoiceType, amountDue, dueDate, notes, installments } = req.body;

      if (!enrollmentIds || !invoiceType || !amountDue || !dueDate) {
        res.status(400).json({
          success: false,
          message: 'الحقول الأساسية مطلوبة'
        });
        return;
      }

      const result = await this.enrollmentService.createBulkInvoices(teacherId, {
        enrollmentIds,
        invoiceType,
        amountDue,
        dueDate,
        notes,
        installments
      });

      res.status(201).json(result);
    } catch (error) {
      console.error('Error creating bulk invoices:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : getMessage('SERVER.SOMETHING_WENT_WRONG')
      });
    }
  }

  /**
   * الحصول على فواتير المعلم
   */
  async getInvoices(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId || req.user?.userType !== UserType.TEACHER) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.TEACHER_ACCESS_REQUIRED')
        });
        return;
      }

      const { page, limit, search, sortBy } = req.query;
      const params = {
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 10,
        search: search as string,
        sortBy: sortBy ? JSON.parse(sortBy as string) : undefined
      };

      const result = await this.enrollmentService.getInvoices(teacherId, params);

      res.status(200).json({
        success: true,
        message: getMessage('INVOICE.CREATED'),
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Error getting invoices:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : getMessage('SERVER.SOMETHING_WENT_WRONG')
      });
    }
  }

  /**
   * الحصول على فاتورة محددة
   */
  async getInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId || req.user?.userType !== UserType.TEACHER) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.TEACHER_ACCESS_REQUIRED')
        });
        return;
      }

      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          message: 'معرف الفاتورة مطلوب'
        });
        return;
      }

      const invoice = await this.enrollmentService.getInvoice(id);
      if (!invoice) {
        res.status(404).json({
          success: false,
          message: getMessage('INVOICE.NOT_FOUND')
        });
        return;
      }

      // التحقق من أن الفاتورة تخص المعلم
      if (invoice.teacherId !== teacherId) {
        res.status(403).json({
          success: false,
          message: getMessage('INVOICE.UNAUTHORIZED')
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: getMessage('INVOICE.CREATED'),
        data: invoice
      });
    } catch (error) {
      console.error('Error getting invoice:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : getMessage('SERVER.SOMETHING_WENT_WRONG')
      });
    }
  }

  /**
   * تحديث الفاتورة
   */
  async updateInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId || req.user?.userType !== UserType.TEACHER) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.TEACHER_ACCESS_REQUIRED')
        });
        return;
      }

      const { id } = req.params;
      const { amountPaid, dueDate, notes } = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'معرف الفاتورة مطلوب'
        });
        return;
      }

      // التحقق من وجود الفاتورة
      const invoice = await this.enrollmentService.getInvoice(id);
      if (!invoice) {
        res.status(404).json({
          success: false,
          message: getMessage('INVOICE.NOT_FOUND')
        });
        return;
      }

      // التحقق من أن الفاتورة تخص المعلم
      if (invoice.teacherId !== teacherId) {
        res.status(403).json({
          success: false,
          message: getMessage('INVOICE.UNAUTHORIZED')
        });
        return;
      }

      const updatedInvoice = await this.enrollmentService.updateInvoice(id, {
        amountPaid,
        dueDate,
        notes
      });

      res.status(200).json({
        success: true,
        message: getMessage('INVOICE.UPDATED'),
        data: updatedInvoice
      });
    } catch (error) {
      console.error('Error updating invoice:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : getMessage('SERVER.SOMETHING_WENT_WRONG')
      });
    }
  }

  /**
   * الحصول على بيانات لوحة تحكم المعلم
   */
  async getDashboard(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId || req.user?.userType !== UserType.TEACHER) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.TEACHER_ACCESS_REQUIRED')
        });
        return;
      }

      const dashboardData = await this.enrollmentService.getTeacherDashboard(teacherId);

      res.status(200).json({
        success: true,
        message: getMessage('TEACHER_DASHBOARD.DATA_RETRIEVED'),
        data: dashboardData
      });
    } catch (error) {
      console.error('Error getting teacher dashboard:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : getMessage('SERVER.SOMETHING_WENT_WRONG')
      });
    }
  }

  /**
   * تحديث المدفوعات
   */
  async updatePayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.user?.id;
      if (!teacherId || req.user?.userType !== UserType.TEACHER) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.TEACHER_ACCESS_REQUIRED')
        });
        return;
      }

      const { id } = req.params;
      const { amountPaid } = req.body;

      if (!id || !amountPaid || amountPaid <= 0) {
        res.status(400).json({
          success: false,
          message: getMessage('INVOICE.INVALID_AMOUNT_PAID')
        });
        return;
      }

      const result = await this.enrollmentService.updatePayment(id, amountPaid, teacherId, 'teacher');

      res.status(200).json(result);
    } catch (error) {
      console.error('Error updating payment:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : getMessage('SERVER.SOMETHING_WENT_WRONG')
      });
    }
  }
}
