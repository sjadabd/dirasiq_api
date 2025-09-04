import {
  CourseEnrollmentRequest,
  CreateEnrollmentRequestRequest,
  EnrollmentRequestResponse,
  PaginatedResponse,
  PaginationParams,
  UpdateEnrollmentRequestRequest
} from '@/types';
import { getMessage } from '@/utils/messages';
import { Pool } from 'pg';

export class CourseEnrollmentRequestModel {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * إنشاء طلب تسجيل جديد
   */
  async create(
    studentId: string,
    teacherId: string,
    data: CreateEnrollmentRequestRequest
  ): Promise<CourseEnrollmentRequest> {
    const { courseId: requestCourseId, studyYear, studentMessage } = data;

    // التحقق من أن الكورس يخص المعلم
    const courseQuery = `
      SELECT id, teacher_id FROM courses
      WHERE id = $1 AND is_deleted = false
    `;
    const courseResult = await this.pool.query(courseQuery, [requestCourseId]);

    if (courseResult.rows.length === 0) {
      throw new Error(getMessage('ENROLLMENT_REQUEST.COURSE_NOT_FOUND'));
    }

    if (courseResult.rows[0].teacher_id !== teacherId) {
      throw new Error(getMessage('ENROLLMENT_REQUEST.COURSE_NOT_OWNED_BY_TEACHER'));
    }

    // التحقق من عدم وجود طلب مسبق
    const existingRequestQuery = `
      SELECT id FROM course_enrollment_requests
      WHERE student_id = $1 AND course_id = $2 AND study_year = $3 AND deleted_at IS NULL
    `;
    const existingRequestResult = await this.pool.query(existingRequestQuery, [studentId, requestCourseId, studyYear]);

    if (existingRequestResult.rows.length > 0) {
      throw new Error(getMessage('ENROLLMENT_REQUEST.DUPLICATE_REQUEST'));
    }

    const query = `
      INSERT INTO course_enrollment_requests (
        student_id, teacher_id, course_id, study_year,
        student_message, expires_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP + INTERVAL '7 days')
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      studentId, teacherId, requestCourseId, studyYear, studentMessage
    ]);

    return result.rows[0];
  }

  /**
   * الحصول على طلب تسجيل بواسطة المعرف
   */
  async findById(id: string): Promise<CourseEnrollmentRequest | null> {
    const query = `
      SELECT * FROM course_enrollment_requests
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * الحصول على طلب تسجيل مع البيانات المرتبطة
   */
  async findByIdWithDetails(id: string): Promise<EnrollmentRequestResponse | null> {
    const query = `
      SELECT
        cer.*,
        s.name as student_name, s.email as student_email,
        t.name as teacher_name, t.email as teacher_email,
        c.course_name, c.price, c.start_date, c.end_date
      FROM course_enrollment_requests cer
      JOIN users s ON cer.student_id = s.id
      JOIN users t ON cer.teacher_id = t.id
      JOIN courses c ON cer.course_id = c.id
      WHERE cer.id = $1 AND cer.deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * الحصول على جميع طلبات التسجيل للمعلم
   */
  async findByTeacherId(
    teacherId: string,
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<EnrollmentRequestResponse>> {
    const { page = 1, limit = 10, search = '', sortBy } = params;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE cer.teacher_id = $1 AND cer.deleted_at IS NULL';
    const queryParams: any[] = [teacherId];
    let paramIndex = 2;

    if (search) {
      whereClause += ` AND (
        s.name ILIKE $${paramIndex} OR
        c.course_name ILIKE $${paramIndex} OR
        cer.study_year ILIKE $${paramIndex}
      )`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const orderBy = sortBy ? `ORDER BY cer.${sortBy.key} ${sortBy.order}` : 'ORDER BY cer.created_at DESC';

    const countQuery = `
      SELECT COUNT(*)
      FROM course_enrollment_requests cer
      JOIN users s ON cer.student_id = s.id
      JOIN courses c ON cer.course_id = c.id
      ${whereClause}
    `;

    const dataQuery = `
      SELECT
        cer.*,
        s.name as student_name, s.email as student_email,
        t.name as teacher_name, t.email as teacher_email,
        c.course_name, c.price, c.start_date, c.end_date
      FROM course_enrollment_requests cer
      JOIN users s ON cer.student_id = s.id
      JOIN users t ON cer.teacher_id = t.id
      JOIN courses c ON cer.course_id = c.id
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
   * الحصول على جميع طلبات التسجيل للطالب
   */
  async findByStudentId(
    studentId: string,
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<EnrollmentRequestResponse>> {
    const { page = 1, limit = 10, search = '', sortBy } = params;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE cer.student_id = $1 AND cer.deleted_at IS NULL';
    const queryParams: any[] = [studentId];
    let paramIndex = 2;

    if (search) {
      whereClause += ` AND (
        t.name ILIKE $${paramIndex} OR
        c.course_name ILIKE $${paramIndex} OR
        cer.study_year ILIKE $${paramIndex}
      )`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const orderBy = sortBy ? `ORDER BY cer.${sortBy.key} ${sortBy.order}` : 'ORDER BY cer.created_at DESC';

    const countQuery = `
      SELECT COUNT(*)
      FROM course_enrollment_requests cer
      JOIN users t ON cer.teacher_id = t.id
      JOIN courses c ON cer.course_id = c.id
      ${whereClause}
    `;

    const dataQuery = `
      SELECT
        cer.*,
        s.name as student_name, s.email as student_email,
        t.name as teacher_name, t.email as teacher_email,
        c.course_name, c.price, c.start_date, c.end_date
      FROM course_enrollment_requests cer
      JOIN users s ON cer.student_id = s.id
      JOIN users t ON cer.teacher_id = t.id
      JOIN courses c ON cer.course_id = c.id
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
   * تحديث طلب التسجيل
   */
  async update(
    id: string,
    data: UpdateEnrollmentRequestRequest
  ): Promise<CourseEnrollmentRequest | null> {
    const { requestStatus, teacherResponse } = data;

    const query = `
      UPDATE course_enrollment_requests
      SET
        request_status = COALESCE($1, request_status),
        teacher_response = COALESCE($2, teacher_response),
        responded_at = CASE WHEN $1 IS NOT NULL THEN CURRENT_TIMESTAMP ELSE responded_at END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await this.pool.query(query, [requestStatus, teacherResponse, id]);
    return result.rows[0] || null;
  }

  /**
   * حذف طلب التسجيل (حذف ناعم)
   */
  async delete(id: string): Promise<boolean> {
    const query = `
      UPDATE course_enrollment_requests
      SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * الحصول على عدد الطلبات المعلقة للمعلم
   */
  async getPendingCountByTeacherId(teacherId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) FROM course_enrollment_requests
      WHERE teacher_id = $1 AND request_status = 'pending' AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [teacherId]);
    return parseInt(result.rows[0].count);
  }

  /**
   * الحصول على عدد الطلبات المعلقة للطالب
   */
  async getPendingCountByStudentId(studentId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) FROM course_enrollment_requests
      WHERE student_id = $1 AND request_status = 'pending' AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [studentId]);
    return parseInt(result.rows[0].count);
  }

  /**
   * تحديث الطلبات منتهية الصلاحية
   */
  async updateExpiredRequests(): Promise<number> {
    const query = `
      UPDATE course_enrollment_requests
      SET
        request_status = 'expired',
        updated_at = CURRENT_TIMESTAMP
      WHERE expires_at < CURRENT_TIMESTAMP
      AND request_status = 'pending'
      AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query);
    return result.rowCount ?? 0;
  }

  /**
   * التحقق من إمكانية إنشاء طلب جديد
   */
  async canCreateRequest(studentId: string, courseId: string, studyYear: string): Promise<boolean> {
    const query = `
      SELECT COUNT(*) FROM course_enrollment_requests
      WHERE student_id = $1 AND course_id = $2 AND study_year = $3
      AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [studentId, courseId, studyYear]);
    return parseInt(result.rows[0].count) === 0;
  }
}
