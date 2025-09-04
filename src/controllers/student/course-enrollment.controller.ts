import { CourseEnrollmentService } from '@/services/course-enrollment.service';
import { UserType } from '@/types';
import { getMessage } from '@/utils/messages';
import { Request, Response } from 'express';

export class StudentCourseEnrollmentController {
  private enrollmentService: CourseEnrollmentService;

  constructor(enrollmentService: CourseEnrollmentService) {
    this.enrollmentService = enrollmentService;
  }

  /**
   * إنشاء طلب تسجيل في كورس
   */
  async createEnrollmentRequest(req: Request, res: Response): Promise<void> {
    try {
      const studentId = req.user?.id;
      if (!studentId || req.user?.userType !== UserType.STUDENT) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.STUDENT_ACCESS_REQUIRED')
        });
        return;
      }

      const { courseId, studyYear, studentMessage } = req.body;

      if (!courseId || !studyYear) {
        res.status(400).json({
          success: false,
          message: getMessage('ENROLLMENT_REQUEST.COURSE_ID_REQUIRED')
        });
        return;
      }

      const result = await this.enrollmentService.createEnrollmentRequest(
        studentId,
        courseId,
        { courseId, studyYear, studentMessage }
      );

      res.status(201).json(result);
    } catch (error) {
      console.error('Error creating enrollment request:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : getMessage('SERVER.SOMETHING_WENT_WRONG')
      });
    }
  }

  /**
   * الحصول على طلبات التسجيل للطالب
   */
  async getMyEnrollmentRequests(req: Request, res: Response): Promise<void> {
    try {
      const studentId = req.user?.id;
      if (!studentId || req.user?.userType !== UserType.STUDENT) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.STUDENT_ACCESS_REQUIRED')
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

      const result = await this.enrollmentService['enrollmentRequestModel'].findByStudentId(studentId, params);

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
   * الحصول على طلب تسجيل محدد
   */
  async getEnrollmentRequest(req: Request, res: Response): Promise<void> {
    try {
      const studentId = req.user?.id;
      if (!studentId || req.user?.userType !== UserType.STUDENT) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.STUDENT_ACCESS_REQUIRED')
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

      const request = await this.enrollmentService['enrollmentRequestModel'].findByIdWithDetails(id);
      if (!request) {
        res.status(404).json({
          success: false,
          message: getMessage('ENROLLMENT_REQUEST.NOT_FOUND')
        });
        return;
      }

      // التحقق من أن الطلب يخص الطالب
      if (request.studentId !== studentId) {
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
   * حذف طلب التسجيل
   */
  async deleteEnrollmentRequest(req: Request, res: Response): Promise<void> {
    try {
      const studentId = req.user?.id;
      if (!studentId || req.user?.userType !== UserType.STUDENT) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.STUDENT_ACCESS_REQUIRED')
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

      // التحقق من وجود الطلب
      const request = await this.enrollmentService['enrollmentRequestModel'].findById(id);
      if (!request) {
        res.status(404).json({
          success: false,
          message: getMessage('ENROLLMENT_REQUEST.NOT_FOUND')
        });
        return;
      }

      // التحقق من أن الطلب يخص الطالب
      if (request.studentId !== studentId) {
        res.status(403).json({
          success: false,
          message: getMessage('ENROLLMENT_REQUEST.UNAUTHORIZED')
        });
        return;
      }

      // التحقق من أن الطلب قابل للحذف
      if (request.requestStatus !== 'pending') {
        res.status(400).json({
          success: false,
          message: 'لا يمكن حذف طلب تم الرد عليه'
        });
        return;
      }

      await this.enrollmentService['enrollmentRequestModel'].delete(id);

      res.status(200).json({
        success: true,
        message: getMessage('ENROLLMENT_REQUEST.DELETED')
      });
    } catch (error) {
      console.error('Error deleting enrollment request:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : getMessage('SERVER.SOMETHING_WENT_WRONG')
      });
    }
  }

  /**
   * الحصول على تسجيلات الطالب
   */
  async getMyEnrollments(req: Request, res: Response): Promise<void> {
    try {
      const studentId = req.user?.id;
      if (!studentId || req.user?.userType !== UserType.STUDENT) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.STUDENT_ACCESS_REQUIRED')
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

      const result = await this.enrollmentService['enrollmentModel'].findByStudentId(studentId, params);

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
  async getEnrollment(req: Request, res: Response): Promise<void> {
    try {
      const studentId = req.user?.id;
      if (!studentId || req.user?.userType !== UserType.STUDENT) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.STUDENT_ACCESS_REQUIRED')
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

      const enrollment = await this.enrollmentService['enrollmentModel'].findByIdWithDetails(id);
      if (!enrollment) {
        res.status(404).json({
          success: false,
          message: getMessage('ENROLLMENT.NOT_FOUND')
        });
        return;
      }

      // التحقق من أن التسجيل يخص الطالب
      if (enrollment.studentId !== studentId) {
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
   * الحصول على فواتير الطالب
   */
  async getMyInvoices(req: Request, res: Response): Promise<void> {
    try {
      const studentId = req.user?.id;
      if (!studentId || req.user?.userType !== UserType.STUDENT) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.STUDENT_ACCESS_REQUIRED')
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

      const result = await this.enrollmentService['invoiceModel'].findByStudentId(studentId, params);

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
  async getInvoice(req: Request, res: Response): Promise<void> {
    try {
      const studentId = req.user?.id;
      if (!studentId || req.user?.userType !== UserType.STUDENT) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.STUDENT_ACCESS_REQUIRED')
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

      const invoice = await this.enrollmentService['invoiceModel'].findByIdWithDetails(id);
      if (!invoice) {
        res.status(404).json({
          success: false,
          message: getMessage('INVOICE.NOT_FOUND')
        });
        return;
      }

      // التحقق من أن الفاتورة تخص الطالب
      if (invoice.studentId !== studentId) {
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
   * الحصول على بيانات لوحة تحكم الطالب
   */
  async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const studentId = req.user?.id;
      if (!studentId || req.user?.userType !== UserType.STUDENT) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.STUDENT_ACCESS_REQUIRED')
        });
        return;
      }

      const dashboardData = await this.enrollmentService.getStudentDashboard(studentId);

      res.status(200).json({
        success: true,
        message: getMessage('STUDENT_DASHBOARD.DATA_RETRIEVED'),
        data: dashboardData
      });
    } catch (error) {
      console.error('Error getting student dashboard:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : getMessage('SERVER.SOMETHING_WENT_WRONG')
      });
    }
  }

  /**
   * تحديث المدفوعات
   */
  async updatePayment(req: Request, res: Response): Promise<void> {
    try {
      const studentId = req.user?.id;
      if (!studentId || req.user?.userType !== UserType.STUDENT) {
        res.status(403).json({
          success: false,
          message: getMessage('AUTH.STUDENT_ACCESS_REQUIRED')
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

      const result = await this.enrollmentService.updatePayment(id, amountPaid, studentId, 'student');

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
