import { CourseEnrollmentRequestModel } from '@/models/course-enrollment-request.model';
import { CourseInvoiceModel } from '@/models/course-invoice.model';
import { PaymentInstallmentModel } from '@/models/payment-installment.model';
import { StudentCourseEnrollmentModel } from '@/models/student-course-enrollment.model';
import {
  BulkInvoiceCreationRequest,
  CreateEnrollmentRequestRequest,
  EnrollmentRequestResponse,
  EnrollmentRequestStatus,
  EnrollmentResponse,
  EnrollmentStatus,
  InvoiceResponse,
  PaginatedResponse,
  PaginationParams,
  StudentDashboardData,
  TeacherDashboardData,
  UpdateInvoiceRequest
} from '@/types';
import { getMessage } from '@/utils/messages';

export class CourseEnrollmentService {
  private enrollmentRequestModel: CourseEnrollmentRequestModel;
  private enrollmentModel: StudentCourseEnrollmentModel;
  private invoiceModel: CourseInvoiceModel;
  private installmentModel: PaymentInstallmentModel;

  constructor(
    enrollmentRequestModel: CourseEnrollmentRequestModel,
    enrollmentModel: StudentCourseEnrollmentModel,
    invoiceModel: CourseInvoiceModel,
    installmentModel: PaymentInstallmentModel
  ) {
    this.enrollmentRequestModel = enrollmentRequestModel;
    this.enrollmentModel = enrollmentModel;
    this.invoiceModel = invoiceModel;
    this.installmentModel = installmentModel;
  }

  /**
   * إنشاء طلب تسجيل جديد
   */
  async createEnrollmentRequest(
    studentId: string,
    courseId: string,
    data: CreateEnrollmentRequestRequest
  ): Promise<any> {
    // الحصول على معرف المعلم من الكورس
    const courseQuery = `
      SELECT teacher_id FROM courses WHERE id = $1 AND is_deleted = false
    `;
    const courseResult = await this.enrollmentRequestModel['pool'].query(courseQuery, [courseId]);

    if (courseResult.rows.length === 0) {
      throw new Error(getMessage('ENROLLMENT_REQUEST.COURSE_NOT_FOUND'));
    }

    const teacherId = courseResult.rows[0].teacher_id;

    // التحقق من إمكانية إنشاء الطلب
    const canCreate = await this.enrollmentRequestModel.canCreateRequest(studentId, courseId, data.studyYear);
    if (!canCreate) {
      throw new Error(getMessage('ENROLLMENT_REQUEST.DUPLICATE_REQUEST'));
    }

    // إنشاء طلب التسجيل
    const enrollmentRequest = await this.enrollmentRequestModel.create(
      studentId,
      teacherId,
      {
        courseId,
        studyYear: data.studyYear,
        studentMessage: data.studentMessage || ''
      }
    );

    return {
      success: true,
      message: getMessage('ENROLLMENT_REQUEST.CREATED'),
      data: enrollmentRequest
    };
  }

  /**
   * الحصول على طلبات التسجيل للمعلم
   */
  async getEnrollmentRequests(
    teacherId: string,
    params: PaginationParams
  ): Promise<PaginatedResponse<EnrollmentRequestResponse>> {
    return await this.enrollmentRequestModel.findByTeacherId(teacherId, params);
  }

  /**
   * الحصول على طلب تسجيل واحد
   */
  async getEnrollmentRequest(id: string): Promise<EnrollmentRequestResponse | null> {
    return await this.enrollmentRequestModel.findByIdWithDetails(id);
  }

  /**
   * الحصول على تسجيلات المعلم
   */
  async getEnrollments(
    teacherId: string,
    params: PaginationParams
  ): Promise<PaginatedResponse<EnrollmentResponse>> {
    return await this.enrollmentModel.findByTeacherId(teacherId, params);
  }

  /**
   * الحصول على تسجيل محدد
   */
  async getEnrollment(id: string): Promise<EnrollmentResponse | null> {
    return await this.enrollmentModel.findByIdWithDetails(id);
  }

  /**
   * الحصول على فواتير المعلم
   */
  async getInvoices(
    teacherId: string,
    params: PaginationParams
  ): Promise<PaginatedResponse<InvoiceResponse>> {
    return await this.invoiceModel.findByTeacherId(teacherId, params);
  }

  /**
   * الحصول على فاتورة محددة
   */
  async getInvoice(id: string): Promise<InvoiceResponse | null> {
    return await this.invoiceModel.findByIdWithDetails(id);
  }

  /**
   * تحديث الفاتورة
   */
  async updateInvoice(id: string, data: UpdateInvoiceRequest): Promise<any> {
    return await this.invoiceModel.update(id, data);
  }

  /**
   * الموافقة على طلب التسجيل
   */
  async approveEnrollmentRequest(
    requestId: string,
    teacherId: string,
    data: {
      courseStartDate: string;
      courseEndDate: string;
      totalCourseAmount: number;
      reservationAmount?: number;
    }
  ): Promise<any> {
    // التحقق من وجود الطلب
    const request = await this.enrollmentRequestModel.findById(requestId);
    if (!request) {
      throw new Error(getMessage('ENROLLMENT_REQUEST.NOT_FOUND'));
    }

    // التحقق من أن الطلب يخص المعلم
    if (request.teacherId !== teacherId) {
      throw new Error(getMessage('ENROLLMENT_REQUEST.UNAUTHORIZED'));
    }

    // التحقق من أن الطلب معلق
    if (request.requestStatus !== 'pending') {
      throw new Error('الطلب ليس معلقاً');
    }

    // التحقق من أن الطلب لم ينتهي
    if (new Date() > new Date(request.expiresAt)) {
      throw new Error('الطلب منتهي الصلاحية');
    }

    // التحقق من إمكانية إضافة طالب جديد
    const canAddStudent = await this.enrollmentModel.canTeacherAddStudent(teacherId);
    if (!canAddStudent) {
      throw new Error(getMessage('ENROLLMENT.TEACHER_LIMIT_REACHED'));
    }

    // تحديث حالة الطلب إلى مقبول
    await this.enrollmentRequestModel.update(requestId, {
      requestStatus: EnrollmentRequestStatus.APPROVED,
      teacherResponse: 'تم قبول طلب التسجيل'
    });

    // إنشاء التسجيل
    const enrollment = await this.enrollmentModel.create({
      enrollmentRequestId: requestId,
      courseStartDate: data.courseStartDate,
      courseEndDate: data.courseEndDate,
      totalCourseAmount: data.totalCourseAmount,
      reservationAmount: data.reservationAmount || 0
    });

    // إنشاء فاتورة الحجز إذا كان هناك مبلغ حجز
    let reservationInvoice = null;
    if (data.reservationAmount && data.reservationAmount > 0) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7); // استحقاق خلال أسبوع

      reservationInvoice = await this.invoiceModel.createReservationInvoice(
        enrollment.id,
        data.reservationAmount,
        dueDate.toISOString()
      );
    }

    // إنشاء فاتورة الكورس
    const courseDueDate = new Date(data.courseStartDate);
    courseDueDate.setDate(courseDueDate.getDate() + 30); // استحقاق خلال شهر

    const courseInvoice = await this.invoiceModel.createCourseInvoice(
      enrollment.id,
      data.totalCourseAmount - (data.reservationAmount || 0),
      courseDueDate.toISOString(),
      'فاتورة الكورس'
    );

    return {
      success: true,
      message: getMessage('ENROLLMENT_REQUEST.APPROVED'),
      data: {
        enrollment,
        reservationInvoice,
        courseInvoice
      }
    };
  }

  /**
   * رفض طلب التسجيل
   */
  async rejectEnrollmentRequest(
    requestId: string,
    teacherId: string,
    reason: string
  ): Promise<any> {
    // التحقق من وجود الطلب
    const request = await this.enrollmentRequestModel.findById(requestId);
    if (!request) {
      throw new Error(getMessage('ENROLLMENT_REQUEST.NOT_FOUND'));
    }

    // التحقق من أن الطلب يخص المعلم
    if (request.teacherId !== teacherId) {
      throw new Error(getMessage('ENROLLMENT_REQUEST.UNAUTHORIZED'));
    }

    // التحقق من أن الطلب معلق
    if (request.requestStatus !== 'pending') {
      throw new Error('الطلب ليس معلقاً');
    }

    // تحديث حالة الطلب إلى مرفوض
    await this.enrollmentRequestModel.update(requestId, {
      requestStatus: EnrollmentRequestStatus.REJECTED,
      teacherResponse: reason
    });

    return {
      success: true,
      message: getMessage('ENROLLMENT_REQUEST.REJECTED'),
      data: { requestId, reason }
    };
  }

  /**
   * إنشاء فاتورة حجز
   */
  async createReservationInvoice(
    enrollmentId: string,
    teacherId: string,
    reservationAmount: number,
    dueDate: string
  ): Promise<any> {
    // التحقق من وجود التسجيل
    const enrollment = await this.enrollmentModel.findById(enrollmentId);
    if (!enrollment) {
      throw new Error(getMessage('ENROLLMENT.NOT_FOUND'));
    }

    // التحقق من أن التسجيل يخص المعلم
    if (enrollment.teacherId !== teacherId) {
      throw new Error(getMessage('ENROLLMENT.UNAUTHORIZED'));
    }

    // التحقق من أن التسجيل نشط
    if (enrollment.enrollmentStatus !== 'active') {
      throw new Error(getMessage('INVOICE.ENROLLMENT_NOT_ACTIVE'));
    }

    // إنشاء فاتورة الحجز
    const invoice = await this.invoiceModel.createReservationInvoice(
      enrollmentId,
      reservationAmount,
      dueDate
    );

    return {
      success: true,
      message: getMessage('INVOICE.CREATED'),
      data: invoice
    };
  }

  /**
   * إنشاء فاتورة كورس
   */
  async createCourseInvoice(
    enrollmentId: string,
    teacherId: string,
    courseAmount: number,
    dueDate: string,
    notes?: string
  ): Promise<any> {
    // التحقق من وجود التسجيل
    const enrollment = await this.enrollmentModel.findById(enrollmentId);
    if (!enrollment) {
      throw new Error(getMessage('ENROLLMENT.NOT_FOUND'));
    }

    // التحقق من أن التسجيل يخص المعلم
    if (enrollment.teacherId !== teacherId) {
      throw new Error(getMessage('ENROLLMENT.UNAUTHORIZED'));
    }

    // التحقق من أن التسجيل نشط
    if (enrollment.enrollmentStatus !== 'active') {
      throw new Error(getMessage('INVOICE.ENROLLMENT_NOT_ACTIVE'));
    }

    // إنشاء فاتورة الكورس
    const invoice = await this.invoiceModel.createCourseInvoice(
      enrollmentId,
      courseAmount,
      dueDate,
      notes
    );

    return {
      success: true,
      message: getMessage('INVOICE.CREATED'),
      data: invoice
    };
  }

  /**
   * إنشاء فواتير متعددة
   */
  async createBulkInvoices(
    teacherId: string,
    data: BulkInvoiceCreationRequest
  ): Promise<any> {
    // التحقق من أن جميع التسجيلات تخص المعلم
    for (const enrollmentId of data.enrollmentIds) {
      const enrollment = await this.enrollmentModel.findById(enrollmentId);
      if (!enrollment) {
        throw new Error(`التسجيل ${enrollmentId} غير موجود`);
      }
      if (enrollment.teacherId !== teacherId) {
        throw new Error(`التسجيل ${enrollmentId} لا يخصك`);
      }
    }

    // إنشاء الفواتير
    const result = await this.invoiceModel.createBulk(data);

    return {
      success: result.success,
      message: result.success
        ? getMessage('INVOICE.BULK_CREATION_SUCCESS')
        : getMessage('INVOICE.BULK_CREATION_PARTIAL'),
      data: result
    };
  }

  /**
   * الحصول على بيانات لوحة تحكم المعلم
   */
  async getTeacherDashboard(teacherId: string): Promise<TeacherDashboardData> {
    const [
      totalStudents,
      pendingRequests,
      totalRevenue,
      pendingPayments,
      recentEnrollments,
      recentInvoices
    ] = await Promise.all([
      this.enrollmentModel.getActiveStudentCountByTeacherId(teacherId),
      this.enrollmentRequestModel.getPendingCountByTeacherId(teacherId),
      this.invoiceModel.getTotalRevenueByTeacherId(teacherId),
      this.invoiceModel.getPendingPaymentsByTeacherId(teacherId),
      this.enrollmentModel.findByTeacherId(teacherId, { page: 1, limit: 5 }),
      this.invoiceModel.findByTeacherId(teacherId, { page: 1, limit: 5 })
    ]);

    // الحصول على الحد الأقصى من الطلاب
    const subscriptionQuery = `
      SELECT sp.max_students
      FROM teacher_subscriptions ts
      JOIN subscription_packages sp ON ts.subscription_package_id = sp.id
      WHERE ts.teacher_id = $1 AND ts.is_active = TRUE
      AND CURRENT_TIMESTAMP BETWEEN ts.start_date AND ts.end_date
    `;
    const subscriptionResult = await this.enrollmentRequestModel['pool'].query(subscriptionQuery, [teacherId]);
    const maxStudentsAllowed = subscriptionResult.rows[0]?.max_students || 0;

    return {
      totalStudents,
      maxStudentsAllowed,
      canAddMoreStudents: totalStudents < maxStudentsAllowed,
      activeEnrollments: totalStudents,
      pendingRequests,
      totalRevenue,
      pendingPayments,
      recentEnrollments: recentEnrollments.data,
      recentInvoices: recentInvoices.data
    };
  }

  /**
   * الحصول على بيانات لوحة تحكم الطالب
   */
  async getStudentDashboard(studentId: string): Promise<StudentDashboardData> {
    const [
      totalEnrollments,
      activeEnrollments,
      pendingRequests,
      totalSpent,
      pendingPayments,
      recentEnrollments,
      recentInvoices
    ] = await Promise.all([
      this.enrollmentModel.findByStudentId(studentId, { page: 1, limit: 1000 }),
      this.enrollmentModel.getActiveEnrollmentCountByStudentId(studentId),
      this.enrollmentRequestModel.getPendingCountByStudentId(studentId),
      this.enrollmentModel.getTotalSpentByStudentId(studentId),
      this.invoiceModel.getPendingPaymentsByStudentId(studentId),
      this.enrollmentModel.findByStudentId(studentId, { page: 1, limit: 5 }),
      this.invoiceModel.findByStudentId(studentId, { page: 1, limit: 5 })
    ]);

    const completedCount = recentEnrollments.data.filter(e => e.enrollmentStatus === 'completed').length;

    return {
      totalEnrollments: totalEnrollments.data.length,
      activeEnrollments,
      completedEnrollments: completedCount,
      pendingRequests,
      totalSpent,
      pendingPayments,
      recentEnrollments: recentEnrollments.data,
      recentInvoices: recentInvoices.data
    };
  }

  /**
   * تحديث حالة التسجيل
   */
  async updateEnrollmentStatus(
    enrollmentId: string,
    teacherId: string,
    status: EnrollmentStatus
  ): Promise<any> {
    // التحقق من وجود التسجيل
    const enrollment = await this.enrollmentModel.findById(enrollmentId);
    if (!enrollment) {
      throw new Error(getMessage('ENROLLMENT.NOT_FOUND'));
    }

    // التحقق من أن التسجيل يخص المعلم
    if (enrollment.teacherId !== teacherId) {
      throw new Error(getMessage('ENROLLMENT.UNAUTHORIZED'));
    }

    // تحديث حالة التسجيل
    const updatedEnrollment = await this.enrollmentModel.update(enrollmentId, {
      enrollmentStatus: status
    });

    return {
      success: true,
      message: getMessage('ENROLLMENT.UPDATED'),
      data: updatedEnrollment
    };
  }

  /**
   * تحديث المدفوعات
   */
  async updatePayment(
    invoiceId: string,
    amountPaid: number,
    userId: string,
    userType: 'teacher' | 'student'
  ): Promise<any> {
    // التحقق من وجود الفاتورة
    const invoice = await this.invoiceModel.findById(invoiceId);
    if (!invoice) {
      throw new Error(getMessage('INVOICE.NOT_FOUND'));
    }

    // التحقق من الصلاحيات
    if (userType === 'teacher' && invoice.teacherId !== userId) {
      throw new Error(getMessage('INVOICE.UNAUTHORIZED'));
    }
    if (userType === 'student' && invoice.studentId !== userId) {
      throw new Error(getMessage('INVOICE.UNAUTHORIZED'));
    }

    // تحديث المدفوعات
    const updatedInvoice = await this.invoiceModel.update(invoiceId, {
      amountPaid
    });

    return {
      success: true,
      message: getMessage('INVOICE.UPDATED'),
      data: updatedInvoice
    };
  }

  /**
   * تحديث الطلبات منتهية الصلاحية
   */
  async updateExpiredRequests(): Promise<any> {
    const updatedCount = await this.enrollmentRequestModel.updateExpiredRequests();

    return {
      success: true,
      message: `تم تحديث ${updatedCount} طلب منتهي الصلاحية`,
      data: { updatedCount }
    };
  }

  /**
   * تحديث التسجيلات منتهية الصلاحية
   */
  async updateExpiredEnrollments(): Promise<any> {
    const updatedCount = await this.enrollmentModel.updateExpiredEnrollments();

    return {
      success: true,
      message: `تم تحديث ${updatedCount} تسجيل منتهي الصلاحية`,
      data: { updatedCount }
    };
  }

  /**
   * تحديث الفواتير المتأخرة
   */
  async updateOverdueInvoices(): Promise<any> {
    const updatedCount = await this.invoiceModel.updateOverdueInvoices();

    return {
      success: true,
      message: `تم تحديث ${updatedCount} فاتورة متأخرة`,
      data: { updatedCount }
    };
  }

  /**
   * تحديث الأقساط المتأخرة
   */
  async updateOverdueInstallments(): Promise<any> {
    const updatedCount = await this.installmentModel.updateOverdueInstallments();

    return {
      success: true,
      message: `تم تحديث ${updatedCount} قسط متأخر`,
      data: { updatedCount }
    };
  }
}
