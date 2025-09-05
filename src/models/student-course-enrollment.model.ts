import {
  CreateEnrollmentRequest,
  EnrollmentResponse,
  PaginatedResponse,
  PaginationParams,
  StudentCourseEnrollment,
  UpdateEnrollmentRequest
} from '@/types';
import { getMessage } from '@/utils/messages';
import { Pool } from 'pg';

export class StudentCourseEnrollmentModel {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * إنشاء تسجيل جديد للطالب في الكورس
   */
  async create(data: CreateEnrollmentRequest): Promise<StudentCourseEnrollment> {
    const {
      enrollmentRequestId,
      courseStartDate,
      courseEndDate,
      totalCourseAmount,
      reservationAmount = 0
    } = data;

    // التحقق من وجود طلب التسجيل
    const requestQuery = `
      SELECT cer.*, c.teacher_id, c.price
      FROM course_enrollment_requests cer
      JOIN courses c ON cer.course_id = c.id
      WHERE cer.id = $1 AND cer.request_status = 'approved' AND cer.deleted_at IS NULL
    `;
    const requestResult = await this.pool.query(requestQuery, [enrollmentRequestId]);

    if (requestResult.rows.length === 0) {
      throw new Error(getMessage('ENROLLMENT.ENROLLMENT_REQUEST_NOT_FOUND'));
    }

    const request = requestResult.rows[0];

    // التحقق من أن المعلم لديه اشتراك نشط
    const subscriptionQuery = `
      SELECT ts.*, sp.max_students
      FROM teacher_subscriptions ts
      JOIN subscription_packages sp ON ts.subscription_package_id = sp.id
      WHERE ts.teacher_id = $1 AND ts.is_active = TRUE
      AND CURRENT_TIMESTAMP BETWEEN ts.start_date AND ts.end_date
    `;
    const subscriptionResult = await this.pool.query(subscriptionQuery, [request.teacher_id]);

    if (subscriptionResult.rows.length === 0) {
      throw new Error(getMessage('ENROLLMENT.TEACHER_NO_ACTIVE_SUBSCRIPTION'));
    }

    const subscription = subscriptionResult.rows[0];

    // التحقق من عدد الطلاب الحاليين
    const currentStudentsQuery = `
      SELECT COUNT(*) FROM student_course_enrollments
      WHERE teacher_id = $1 AND enrollment_status IN ('active', 'completed') AND deleted_at IS NULL
    `;
    const currentStudentsResult = await this.pool.query(currentStudentsQuery, [request.teacher_id]);
    const currentStudents = parseInt(currentStudentsResult.rows[0].count);

    if (currentStudents >= subscription.max_students) {
      throw new Error(getMessage('ENROLLMENT.TEACHER_LIMIT_REACHED'));
    }

    // التحقق من مبلغ الحجز
    if (reservationAmount > totalCourseAmount) {
      throw new Error(getMessage('ENROLLMENT.RESERVATION_AMOUNT_TOO_HIGH'));
    }

    // التحقق من التواريخ
    if (new Date(courseEndDate) <= new Date(courseStartDate)) {
      throw new Error(getMessage('ENROLLMENT.INVALID_DATES'));
    }

    const query = `
      INSERT INTO student_course_enrollments (
        enrollment_request_id, student_id, teacher_id, course_id,
        teacher_subscription_id, study_year, course_start_date, course_end_date,
        total_course_amount, reservation_amount
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      enrollmentRequestId, request.student_id, request.teacher_id, request.course_id,
      subscription.id, request.study_year, courseStartDate, courseEndDate,
      totalCourseAmount, reservationAmount
    ]);

    return result.rows[0];
  }

  /**
   * الحصول على تسجيل بواسطة المعرف
   */
  async findById(id: string): Promise<StudentCourseEnrollment | null> {
    const query = `
      SELECT * FROM student_course_enrollments
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * الحصول على تسجيل مع البيانات المرتبطة
   */
  async findByIdWithDetails(id: string): Promise<EnrollmentResponse | null> {
    const query = `
      SELECT
        sce.*,
        s.name as student_name, s.email as student_email,
        t.name as teacher_name, t.email as teacher_email,
        c.course_name, c.price, c.start_date, c.end_date,
        sp.name as package_name, sp.max_students
      FROM student_course_enrollments sce
      JOIN users s ON sce.student_id = s.id
      JOIN users t ON sce.teacher_id = t.id
      JOIN courses c ON sce.course_id = c.id
      JOIN teacher_subscriptions ts ON sce.teacher_subscription_id = ts.id
      JOIN subscription_packages sp ON ts.subscription_package_id = sp.id
      WHERE sce.id = $1 AND sce.deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * الحصول على جميع تسجيلات المعلم
   */
  async findByTeacherId(
    teacherId: string,
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<EnrollmentResponse>> {
    const { page = 1, limit = 10, search = '', sortBy } = params;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE sce.teacher_id = $1 AND sce.deleted_at IS NULL';
    const queryParams: any[] = [teacherId];
    let paramIndex = 2;

    if (search) {
      whereClause += ` AND (
        s.name ILIKE $${paramIndex} OR
        c.course_name ILIKE $${paramIndex} OR
        sce.study_year ILIKE $${paramIndex}
      )`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const orderBy = sortBy ? `ORDER BY sce.${sortBy.key} ${sortBy.order}` : 'ORDER BY sce.created_at DESC';

    const countQuery = `
      SELECT COUNT(*)
      FROM student_course_enrollments sce
      JOIN users s ON sce.student_id = s.id
      JOIN courses c ON sce.course_id = c.id
      ${whereClause}
    `;

    const dataQuery = `
      SELECT
        sce.*,
        s.name as student_name, s.email as student_email,
        t.name as teacher_name, t.email as teacher_email,
        c.course_name, c.price, c.start_date, c.end_date,
        sp.name as package_name, sp.max_students
      FROM student_course_enrollments sce
      JOIN users s ON sce.student_id = s.id
      JOIN users t ON sce.teacher_id = t.id
      JOIN courses c ON sce.course_id = c.id
      JOIN teacher_subscriptions ts ON sce.teacher_subscription_id = ts.id
      JOIN subscription_packages sp ON ts.subscription_package_id = sp.id
      ${whereClause}
      ${orderBy}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const [countResult, dataResult] = await Promise.all([
      this.pool.query(countQuery, queryParams),
      this.pool.query(dataQuery, [...queryParams, limit, offset])
    ]);

    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    return {
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }

  /**
   * الحصول على جميع تسجيلات الطالب
   */
  async findByStudentId(
    studentId: string,
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<EnrollmentResponse>> {
    const { page = 1, limit = 10, search = '', sortBy } = params;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE sce.student_id = $1 AND sce.deleted_at IS NULL';
    const queryParams: any[] = [studentId];
    let paramIndex = 2;

    if (search) {
      whereClause += ` AND (
        t.name ILIKE $${paramIndex} OR
        c.course_name ILIKE $${paramIndex} OR
        sce.study_year ILIKE $${paramIndex}
      )`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const orderBy = sortBy ? `ORDER BY sce.${sortBy.key} ${sortBy.order}` : 'ORDER BY sce.created_at DESC';

    const countQuery = `
      SELECT COUNT(*)
      FROM student_course_enrollments sce
      JOIN users t ON sce.teacher_id = t.id
      JOIN courses c ON sce.course_id = c.id
      ${whereClause}
    `;

    const dataQuery = `
      SELECT
        sce.*,
        s.name as student_name, s.email as student_email,
        t.name as teacher_name, t.email as teacher_email,
        c.course_name, c.price, c.start_date, c.end_date,
        sp.name as package_name, sp.max_students
      FROM student_course_enrollments sce
      JOIN users s ON sce.student_id = s.id
      JOIN users t ON sce.teacher_id = t.id
      JOIN courses c ON sce.course_id = c.id
      JOIN teacher_subscriptions ts ON sce.teacher_subscription_id = ts.id
      JOIN subscription_packages sp ON ts.subscription_package_id = sp.id
      ${whereClause}
      ${orderBy}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const [countResult, dataResult] = await Promise.all([
      this.pool.query(countQuery, queryParams),
      this.pool.query(dataQuery, [...queryParams, limit, offset])
    ]);

    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    return {
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }

  /**
   * تحديث التسجيل
   */
  async update(
    id: string,
    data: UpdateEnrollmentRequest
  ): Promise<StudentCourseEnrollment | null> {
    const {
      enrollmentStatus,
      courseStartDate,
      courseEndDate,
      totalCourseAmount,
      reservationAmount
    } = data;

    // التحقق من أن التسجيل قابل للتعديل
    const currentEnrollment = await this.findById(id);
    if (!currentEnrollment) {
      throw new Error(getMessage('ENROLLMENT.NOT_FOUND'));
    }

    if (currentEnrollment.enrollmentStatus === 'completed') {
      throw new Error(getMessage('ENROLLMENT.CANNOT_MODIFY_COMPLETED'));
    }

    if (currentEnrollment.enrollmentStatus === 'cancelled') {
      throw new Error(getMessage('ENROLLMENT.CANNOT_MODIFY_CANCELLED'));
    }

    // التحقق من مبلغ الحجز إذا تم تحديثه
    if (reservationAmount !== undefined) {
      const finalTotalAmount = totalCourseAmount || currentEnrollment.totalCourseAmount;
      if (reservationAmount > finalTotalAmount) {
        throw new Error(getMessage('ENROLLMENT.RESERVATION_AMOUNT_TOO_HIGH'));
      }
    }

    // التحقق من التواريخ إذا تم تحديثها
    if (courseStartDate && courseEndDate) {
      if (new Date(courseEndDate) <= new Date(courseStartDate)) {
        throw new Error(getMessage('ENROLLMENT.INVALID_DATES'));
      }
    }

    const query = `
      UPDATE student_course_enrollments
      SET
        enrollment_status = COALESCE($1, enrollment_status),
        course_start_date = COALESCE($2, course_start_date),
        course_end_date = COALESCE($3, course_end_date),
        total_course_amount = COALESCE($4, total_course_amount),
        reservation_amount = COALESCE($5, reservation_amount),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      enrollmentStatus, courseStartDate, courseEndDate,
      totalCourseAmount, reservationAmount, id
    ]);

    return result.rows[0] || null;
  }

  /**
   * حذف التسجيل (حذف ناعم)
   */
  async delete(id: string): Promise<boolean> {
    const query = `
      UPDATE student_course_enrollments
      SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * الحصول على عدد الطلاب النشطين للمعلم
   */
  async getActiveStudentCountByTeacherId(teacherId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) FROM student_course_enrollments
      WHERE teacher_id = $1 AND enrollment_status IN ('active', 'completed') AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [teacherId]);
    return parseInt(result.rows[0].count);
  }

  /**
   * الحصول على عدد التسجيلات النشطة للطالب
   */
  async getActiveEnrollmentCountByStudentId(studentId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) FROM student_course_enrollments
      WHERE student_id = $1 AND enrollment_status IN ('active', 'completed') AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [studentId]);
    return parseInt(result.rows[0].count);
  }

  /**
   * الحصول على إجمالي المبالغ المدفوعة للطالب
   */
  async getTotalSpentByStudentId(studentId: string): Promise<number> {
    const query = `
      SELECT COALESCE(SUM(reservation_amount), 0) as total_spent
      FROM student_course_enrollments
      WHERE student_id = $1 AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [studentId]);
    return parseFloat(result.rows[0].total_spent);
  }

  /**
   * التحقق من إمكانية إضافة طالب جديد للمعلم
   */
  async canTeacherAddStudent(teacherId: string): Promise<boolean> {
    const query = `
      SELECT
        ts.is_active,
        sp.max_students,
        COUNT(sce.id) as current_students
      FROM teacher_subscriptions ts
      JOIN subscription_packages sp ON ts.subscription_package_id = sp.id
      LEFT JOIN student_course_enrollments sce ON sce.teacher_id = ts.teacher_id
        AND sce.enrollment_status IN ('active', 'completed')
        AND sce.deleted_at IS NULL
      WHERE ts.teacher_id = $1
      AND ts.is_active = TRUE
      AND CURRENT_TIMESTAMP BETWEEN ts.start_date AND ts.end_date
      GROUP BY ts.is_active, sp.max_students
    `;

    const result = await this.pool.query(query, [teacherId]);

    if (result.rows.length === 0) {
      return false;
    }

    const { max_students, current_students } = result.rows[0];
    return current_students < max_students;
  }

  /**
   * الحصول على التسجيلات المنتهية الصلاحية
   */
  async getExpiredEnrollments(): Promise<StudentCourseEnrollment[]> {
    const query = `
      SELECT * FROM student_course_enrollments
      WHERE course_end_date < CURRENT_DATE
      AND enrollment_status = 'active'
      AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * تحديث حالة التسجيلات المنتهية
   */
  async updateExpiredEnrollments(): Promise<number> {
    const query = `
      UPDATE student_course_enrollments
      SET
        enrollment_status = 'expired',
        updated_at = CURRENT_TIMESTAMP
      WHERE course_end_date < CURRENT_DATE
      AND enrollment_status = 'active'
      AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query);
    return result.rowCount ?? 0;
  }
}
