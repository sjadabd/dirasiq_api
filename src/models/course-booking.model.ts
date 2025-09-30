import pool from '@/config/database';
import { BookingStatus, CourseBooking, CourseBookingWithDetails, CreateCourseBookingRequest, UpdateCourseBookingRequest } from '@/types';
import { BookingUsageLogModel } from './booking-usage-log.model';
import { TeacherSubscriptionModel } from './teacher-subscription.model';

export class CourseBookingModel {
  // Create new course booking
  static async create(studentId: string, data: CreateCourseBookingRequest): Promise<CourseBooking> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // First, get the course details to extract teacher_id and study_year
      const courseQuery = 'SELECT teacher_id, study_year FROM courses WHERE id = $1 AND is_deleted = false';
      const courseResult = await client.query(courseQuery, [data.courseId]);

      if (courseResult.rows.length === 0) {
        throw new Error('Course not found');
      }

      const teacherId = courseResult.rows[0].teacher_id;
      const studyYear = courseResult.rows[0].study_year;

      // Check if booking already exists
      const existingBookingQuery = 'SELECT id FROM course_bookings WHERE student_id = $1 AND course_id = $2 AND is_deleted = false';
      const existingBookingResult = await client.query(existingBookingQuery, [studentId, data.courseId]);

      if (existingBookingResult.rows.length > 0) {
        const error = new Error('Booking already exists for this course');
        (error as any).code = '23505';
        (error as any).constraint = 'unique_student_course_booking';
        throw error;
      }

      const query = `
        INSERT INTO course_bookings (
          student_id, course_id, teacher_id, study_year, status, student_message
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const values = [
        studentId,
        data.courseId,
        teacherId,
        studyYear,
        BookingStatus.PENDING,
        data.studentMessage || null
      ];

      const result = await client.query(query, values);
      await client.query('COMMIT');

      return this.mapDatabaseBookingToBooking(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get booking by ID
  static async findById(id: string): Promise<CourseBooking | null> {
    const query = 'SELECT * FROM course_bookings WHERE id = $1 AND is_deleted = false';
    const result = await pool.query(query, [id]);
    return result.rows[0] ? this.mapDatabaseBookingToBooking(result.rows[0]) : null;
  }

  // Get booking by ID with details
  static async findByIdWithDetails(id: string): Promise<CourseBookingWithDetails | null> {
    const query = `
      SELECT
        cb.*,
        s.id as student_id, s.name as student_name, s.email as student_email,
        c.id as course_id, c.course_name, c.course_images, c.description, c.start_date, c.end_date, c.price, c.seats_count,
        c.has_reservation, c.reservation_amount,
        t.id as teacher_id, t.name as teacher_name, t.email as teacher_email
      FROM course_bookings cb
      JOIN users s ON cb.student_id = s.id
      JOIN courses c ON cb.course_id = c.id
      JOIN users t ON cb.teacher_id = t.id
      WHERE cb.id = $1 AND cb.is_deleted = false
    `;

    const result = await pool.query(query, [id]);
    return result.rows[0] ? this.mapDatabaseBookingWithDetails(result.rows[0]) : null;
  }

  // Get all bookings for a student (with details)
  static async findAllByStudent(
    studentId: string,
    studyYear: string,
    page: number = 1,
    limit: number = 10,
    status?: BookingStatus,
    excludeStatus?: BookingStatus
  ): Promise<{ bookings: CourseBookingWithDetails[], total: number }> {
    let whereClause = 'WHERE cb.student_id = $1 AND cb.study_year = $2 AND cb.is_deleted = false';
    let params: any[] = [studentId, studyYear];
    let paramIndex = 3;

    if (status) {
      whereClause += ` AND cb.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    } else if (excludeStatus) {
      whereClause += ` AND cb.status <> $${paramIndex}`;
      params.push(excludeStatus);
      paramIndex++;
    }

    const countQuery = `SELECT COUNT(*) FROM course_bookings cb ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    const offset = (page - 1) * limit;
    const query = `
      SELECT
        cb.*,
        s.id as student_id, s.name as student_name, s.email as student_email,
        c.id as course_id, c.course_name, c.course_images, c.description, c.start_date, c.end_date, c.price, c.seats_count,
        t.id as teacher_id, t.name as teacher_name, t.email as teacher_email
      FROM course_bookings cb
      JOIN users s ON cb.student_id = s.id
      JOIN courses c ON cb.course_id = c.id
      JOIN users t ON cb.teacher_id = t.id
      ${whereClause}
      ORDER BY cb.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);
    const result = await pool.query(query, params);

    const bookings = result.rows.map(row => this.mapDatabaseBookingWithDetails(row));

    return { bookings, total };
  }

  // Get all bookings for a teacher
  static async findAllByTeacher(
    teacherId: string,
    studyYear: string,
    page: number = 1,
    limit: number = 10,
    status?: BookingStatus
  ): Promise<{ bookings: CourseBookingWithDetails[], total: number }> {
    let whereClause = 'WHERE cb.teacher_id = $1 AND cb.study_year = $2 AND cb.is_deleted = false';
    let params: any[] = [teacherId, studyYear];
    let paramIndex = 3;

    if (status) {
      whereClause += ` AND cb.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    const countQuery = `
    SELECT COUNT(*) FROM course_bookings cb
    ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    const offset = (page - 1) * limit;
    const query = `
      SELECT
        cb.*,
        s.id as student_id, s.name as student_name, s.email as student_email,
        c.id as course_id, c.has_reservation, c.reservation_amount, c.course_name, c.course_images, c.description, c.start_date, c.end_date, c.price, c.seats_count,
        t.id as teacher_id, t.name as teacher_name, t.email as teacher_email
      FROM course_bookings cb
      JOIN users s ON cb.student_id = s.id
      JOIN courses c ON cb.course_id = c.id
      JOIN users t ON cb.teacher_id = t.id
      ${whereClause}
      ORDER BY cb.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);
    const result = await pool.query(query, params);

    const bookings = result.rows.map(row => this.mapDatabaseBookingWithDetails(row));

    return { bookings, total };
  }

  // Update booking status (for teacher approval/rejection)
  static async updateStatus(
    id: string,
    teacherId: string,
    data: UpdateCourseBookingRequest
  ): Promise<CourseBooking> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify the booking belongs to the teacher and get current status
      const verifyQuery = `
        SELECT id, status, teacher_id, student_id, course_id
        FROM course_bookings
        WHERE id = $1 AND teacher_id = $2 AND is_deleted = false
      `;
      const verifyResult = await client.query(verifyQuery, [id, teacherId]);

      if (verifyResult.rows.length === 0) {
        throw new Error('Booking not found or access denied');
      }

      const currentBooking = verifyResult.rows[0];
      const currentStatus = currentBooking.status;

      // التحقق من وجود student_id
      if (!currentBooking.student_id) {
        throw new Error('Student ID not found in booking');
      }

      // منع التلاعب: منع تأكيد الحجز إذا كان مؤكداً بالفعل + التحقق من السعة عند التأكيد
      if (data.status === BookingStatus.CONFIRMED) {
        if (currentStatus === BookingStatus.CONFIRMED) {
          throw new Error('الحجز مؤكد بالفعل');
        }
        // التحقق من السعة قبل التأكيد
        const capacityCheck = await TeacherSubscriptionModel.canAddStudent(teacherId);
        if (!capacityCheck.canAdd) {
          throw new Error(capacityCheck.message || 'لا يمكن تأكيد الحجز');
        }
      }

      // منع تغيير status إلى rejected إذا كان بالفعل rejected
      if (data.status === BookingStatus.REJECTED && currentStatus === BookingStatus.REJECTED) {
        throw new Error('الحجز مرفوض بالفعل');
      }

      let updateFields: string[] = [];
      let values: any[] = [];
      let paramIndex = 1;

      if (data.status) {
        updateFields.push(`status = $${paramIndex}`);
        values.push(data.status);
        paramIndex++;

        // Set timestamp based on status
        if (data.status === BookingStatus.APPROVED) {
          updateFields.push(`approved_at = $${paramIndex}`);
          values.push(new Date());
          paramIndex++;
        } else if (data.status === BookingStatus.REJECTED) {
          updateFields.push(`rejected_at = $${paramIndex}`);
          values.push(new Date());
          paramIndex++;
          // تخزين من قام بالرفض (teacher) في هذا المسار
          updateFields.push(`rejected_by = 'teacher'`);
        } else if (data.status === BookingStatus.CANCELLED) {
          updateFields.push(`cancelled_at = $${paramIndex}`);
          values.push(new Date());
          paramIndex++;
          updateFields.push(`cancelled_by = 'teacher'`);
        }
      }

      if (data.rejectionReason) {
        updateFields.push(`rejection_reason = $${paramIndex}`);
        values.push(data.rejectionReason);
        paramIndex++;
      }

      if (data.cancellationReason) {
        updateFields.push(`cancellation_reason = $${paramIndex}`);
        values.push(data.cancellationReason);
        paramIndex++;
      }

      if (data.teacherResponse) {
        updateFields.push(`teacher_response = $${paramIndex}`);
        values.push(data.teacherResponse);
        paramIndex++;
      }

      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }

      updateFields.push(`updated_at = $${paramIndex}`);
      values.push(new Date());
      paramIndex++;

      values.push(id);

      const query = `
        UPDATE course_bookings
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await client.query(query, values);

      // تحديث عدد الطلاب الحاليين في الاشتراك وتسجيل الاستخدام (الآن على حالة confirmed)
      if (data.status === BookingStatus.CONFIRMED && currentStatus !== BookingStatus.CONFIRMED) {
        // تأكيد حجز جديد - زيادة العدد
        const capacityCheck = await TeacherSubscriptionModel.canAddStudent(teacherId);
        await TeacherSubscriptionModel.incrementCurrentStudents(teacherId);

        // تسجيل الاستخدام
        await this.logBookingUsage(
          id,
          teacherId,
          currentBooking.student_id,
          capacityCheck.currentStudents,
          capacityCheck.currentStudents + 1,
          'approved',
          currentStatus,
          data.status,
          'teacher',
          data.teacherResponse
        );
      } else if (data.status === BookingStatus.REJECTED && currentStatus === BookingStatus.CONFIRMED) {
        // رفض حجز كان مؤكداً - تقليل العدد
        const capacityCheck = await TeacherSubscriptionModel.canAddStudent(teacherId);
        await TeacherSubscriptionModel.decrementCurrentStudents(teacherId);

        // تسجيل الاستخدام
        await this.logBookingUsage(
          id,
          teacherId,
          currentBooking.student_id,
          capacityCheck.currentStudents,
          capacityCheck.currentStudents - 1,
          'rejected',
          currentStatus,
          data.status,
          'teacher',
          data.rejectionReason
        );
      } else if (data.status === BookingStatus.CANCELLED && currentStatus === BookingStatus.CONFIRMED) {
        // إلغاء حجز كان مؤكداً - تقليل العدد
        const capacityCheck = await TeacherSubscriptionModel.canAddStudent(teacherId);
        await TeacherSubscriptionModel.decrementCurrentStudents(teacherId);

        // تسجيل الاستخدام
        await this.logBookingUsage(
          id,
          teacherId,
          currentBooking.student_id,
          capacityCheck.currentStudents,
          capacityCheck.currentStudents - 1,
          'cancelled',
          currentStatus,
          data.status,
          'teacher',
          data.cancellationReason
        );
      } else if (data.status === BookingStatus.REJECTED && currentStatus !== BookingStatus.REJECTED) {
        // رفض حجز جديد (لم يكن معتمدًا)
        const capacityCheck = await TeacherSubscriptionModel.canAddStudent(teacherId);

        // تسجيل الاستخدام
        await this.logBookingUsage(
          id,
          teacherId,
          currentBooking.student_id,
          capacityCheck.currentStudents,
          capacityCheck.currentStudents,
          'rejected',
          currentStatus,
          data.status,
          'teacher',
          data.rejectionReason
        );
      }

      if (data.status === BookingStatus.CONFIRMED && currentStatus === BookingStatus.PRE_APPROVED) {
        const courseQ = `SELECT reservation_amount, has_reservation FROM courses WHERE id = $1`;
        const courseR = await client.query(courseQ, [currentBooking.course_id]);

        const course = courseR.rows[0];
        if (course && course.has_reservation && course.reservation_amount > 0) {
          // الحالة من المعلم
          const paymentStatus = data.reservationPaid === true ? 'paid' : 'pending';

          const insertPaymentQ = `
            INSERT INTO reservation_payments (booking_id, student_id, teacher_id, course_id, amount, status, paid_at)
            VALUES ($1, $2, $3, $4, $5, $6::varchar, CASE WHEN $6::varchar = 'paid' THEN CURRENT_TIMESTAMP ELSE NULL END)
            ON CONFLICT (booking_id) DO UPDATE SET
              status = EXCLUDED.status,
              paid_at = CASE WHEN EXCLUDED.status = 'paid' THEN CURRENT_TIMESTAMP ELSE NULL END,
              updated_at = CURRENT_TIMESTAMP
          `;
          await client.query(insertPaymentQ, [
            id,
            currentBooking.student_id,
            teacherId,
            currentBooking.course_id,
            course.reservation_amount,
            paymentStatus,
          ]);
        }
      }

      await client.query('COMMIT');

      return this.mapDatabaseBookingToBooking(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Cancel booking (for student)
  static async cancelByStudent(
    id: string,
    studentId: string,
    reason?: string
  ): Promise<CourseBooking> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get current booking status and teacher_id
      const getBookingQuery = `
        SELECT status, teacher_id
        FROM course_bookings
        WHERE id = $1 AND student_id = $2 AND is_deleted = false
      `;
      const bookingResult = await client.query(getBookingQuery, [id, studentId]);

      if (bookingResult.rows.length === 0) {
        throw new Error('Booking not found or access denied');
      }

      const currentStatus = bookingResult.rows[0].status;
      const teacherId = bookingResult.rows[0].teacher_id;

      const query = `
        UPDATE course_bookings
        SET status = $1, cancelled_at = $2, cancellation_reason = $3, updated_at = $2, cancelled_by = 'student'
        WHERE id = $4 AND student_id = $5 AND is_deleted = false
        RETURNING *
      `;

      const result = await client.query(query, [BookingStatus.CANCELLED, new Date(), reason, id, studentId]);

      // تحديث عدد الطلاب الحاليين إذا كان الحجز مؤكداً وتسجيل الاستخدام
      if (currentStatus === BookingStatus.CONFIRMED) {
        const capacityCheck = await TeacherSubscriptionModel.canAddStudent(teacherId);
        await TeacherSubscriptionModel.decrementCurrentStudents(teacherId);

        // تسجيل الاستخدام
        await this.logBookingUsage(
          id,
          teacherId,
          studentId,
          capacityCheck.currentStudents,
          capacityCheck.currentStudents - 1,
          'cancelled',
          currentStatus,
          BookingStatus.CANCELLED,
          'student',
          reason
        );
      }

      await client.query('COMMIT');
      return this.mapDatabaseBookingToBooking(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Cancel booking (for teacher)
  static async cancelByTeacher(
    id: string,
    teacherId: string,
    reason?: string
  ): Promise<CourseBooking> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get current booking status
      const getBookingQuery = `
        SELECT status
        FROM course_bookings
        WHERE id = $1 AND teacher_id = $2 AND is_deleted = false
      `;
      const bookingResult = await client.query(getBookingQuery, [id, teacherId]);

      if (bookingResult.rows.length === 0) {
        throw new Error('Booking not found or access denied');
      }

      const currentStatus = bookingResult.rows[0].status;

      const query = `
        UPDATE course_bookings
        SET status = $1, cancelled_at = $2, cancellation_reason = $3, updated_at = $2, cancelled_by = 'teacher'
        WHERE id = $4 AND teacher_id = $5 AND is_deleted = false
        RETURNING *
      `;

      const result = await client.query(query, [BookingStatus.CANCELLED, new Date(), reason, id, teacherId]);

      // تحديث عدد الطلاب الحاليين إذا كان الحجز مؤكداً وتسجيل الاستخدام
      if (currentStatus === BookingStatus.CONFIRMED) {
        const capacityCheck = await TeacherSubscriptionModel.canAddStudent(teacherId);
        await TeacherSubscriptionModel.decrementCurrentStudents(teacherId);

        // تسجيل الاستخدام
        await this.logBookingUsage(
          id,
          teacherId,
          result.rows[0].student_id,
          capacityCheck.currentStudents,
          capacityCheck.currentStudents - 1,
          'cancelled',
          currentStatus,
          BookingStatus.CANCELLED,
          'teacher',
          reason
        );
      }

      await client.query('COMMIT');
      return this.mapDatabaseBookingToBooking(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Reactivate cancelled booking (for student)
  static async reactivateBooking(
    id: string,
    studentId: string
  ): Promise<CourseBooking> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // First, let's check if the booking exists and get basic info
      const checkQuery = `
        SELECT id, status, student_id, course_id, teacher_id, cancelled_by, cancelled_at, cancellation_reason
        FROM course_bookings
        WHERE id = $1 AND is_deleted = false
      `;

      const checkResult = await client.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        throw new Error('Booking not found');
      }

      const booking = checkResult.rows[0];

      // Check if the booking belongs to the student
      if (booking.student_id !== studentId) {
        throw new Error('Access denied - booking does not belong to you');
      }

      // Check if booking can be reactivated
      if (booking.status === 'pending') {
        throw new Error('Booking is already active and pending');
      }

      if (booking.status === 'approved') {
        throw new Error('Booking is already approved and active');
      }

      if (booking.status === 'rejected') {
        throw new Error('Cannot reactivate rejected bookings. Please create a new booking instead.');
      }

      if (booking.status !== 'cancelled') {
        throw new Error(`Cannot reactivate booking with status: ${booking.status}`);
      }

      if (booking.cancelled_by === 'teacher') {
        throw new Error('Cannot reactivate bookings cancelled by teacher');
      }

      // Check if course is still available
      const courseQuery = `
        SELECT id, is_deleted, end_date
        FROM courses
        WHERE id = $1
      `;

      const courseResult = await client.query(courseQuery, [booking.course_id]);

      if (courseResult.rows.length === 0 || courseResult.rows[0].is_deleted) {
        throw new Error('Course is no longer available');
      }

      // Check if course end date hasn't passed
      const courseEndDate = new Date(courseResult.rows[0].end_date);
      if (courseEndDate < new Date()) {
        // Instead of throwing error, we'll reactivate with a note
      }

      // تمت إزالة التحقق من السعة عند إعادة التفعيل
      // سيتم التحقق من السعة فقط عند موافقة المعلم على الحجز (updateStatus)

      // Reactivate the booking
      const reactivateQuery = `
        UPDATE course_bookings
        SET status = 'pending', cancelled_at = NULL, cancellation_reason = NULL,
            cancelled_by = NULL, updated_at = $1, reactivated_at = $1
        WHERE id = $2
        RETURNING *
      `;

      const result = await client.query(reactivateQuery, [new Date(), id]);
      await client.query('COMMIT');

      const reactivatedBooking = this.mapDatabaseBookingToBooking(result.rows[0]);

      // Add note if course has ended
      if (courseEndDate < new Date()) {
        (reactivatedBooking as any).courseEndedNote = 'تم إعادة تفعيل الحجز مع ملاحظة: الكورس انتهى، يرجى التواصل مع المعلم';
        (reactivatedBooking as any).courseEndedWarning = true;
      }

      return reactivatedBooking;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Soft delete booking
  static async delete(id: string, userId: string, userType: string): Promise<void> {
    let whereClause: string;
    let params: any[];

    if (userType === 'student') {
      whereClause = 'id = $2 AND student_id = $3 AND is_deleted = false';
      params = [new Date(), id, userId];
    } else if (userType === 'teacher') {
      whereClause = 'id = $2 AND teacher_id = $3 AND is_deleted = false';
      params = [new Date(), id, userId];
    } else {
      throw new Error('Invalid user type');
    }

    const query = `
      UPDATE course_bookings
      SET is_deleted = true, updated_at = $1
      WHERE ${whereClause}
    `;

    const result = await pool.query(query, params);

    if (result.rowCount === 0) {
      throw new Error('Booking not found or access denied');
    }
  }

  // Helper method to map database result to CourseBooking
  private static mapDatabaseBookingToBooking(row: any): CourseBooking {
    return {
      id: row.id,
      studentId: row.student_id,
      courseId: row.course_id,
      teacherId: row.teacher_id,
      studyYear: row.study_year,
      status: row.status as BookingStatus,
      bookingDate: row.booking_date,
      approvedAt: row.approved_at,
      rejectedAt: row.rejected_at,
      cancelledAt: row.cancelled_at,
      rejectionReason: row.rejection_reason,
      cancellationReason: row.cancellation_reason,
      studentMessage: row.student_message,
      teacherResponse: row.teacher_response,
      rejectedBy: row.rejected_by || undefined,
      isDeleted: row.is_deleted,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      cancelledBy: row.cancelled_by,
      reactivatedAt: row.reactivated_at
    };
  }

  // Helper method to map database result to CourseBookingWithDetails
  private static mapDatabaseBookingWithDetails(row: any): CourseBookingWithDetails {
    return {
      id: row.id,
      studentId: row.student_id,
      courseId: row.course_id,
      teacherId: row.teacher_id,
      studyYear: row.study_year,
      status: row.status as BookingStatus,
      bookingDate: row.booking_date,
      approvedAt: row.approved_at,
      rejectedAt: row.rejected_at,
      cancelledAt: row.cancelled_at,
      rejectionReason: row.rejection_reason,
      cancellationReason: row.cancellation_reason,
      studentMessage: row.student_message,
      teacherResponse: row.teacher_response,
      rejectedBy: row.rejected_by || undefined,
      isDeleted: row.is_deleted,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      cancelledBy: row.cancelled_by,
      reactivatedAt: row.reactivated_at,
      student: {
        id: row.student_id,
        name: row.student_name,
        email: row.student_email
      },
      course: {
        id: row.course_id,
        courseName: row.course_name,
        courseImages: row.course_images,
        description: row.description,
        startDate: row.start_date,
        endDate: row.end_date,
        price: row.price,
        seatsCount: row.seats_count,
        hasReservation: row.has_reservation,
        reservationAmount: row.reservation_amount
      },
      teacher: {
        id: row.teacher_id,
        name: row.teacher_name,
        email: row.teacher_email
      }
    };
  }

  // دالة مساعدة لتسجيل استخدام الحجز
  private static async logBookingUsage(
    bookingId: string,
    teacherId: string,
    studentId: string,
    studentsBefore: number,
    studentsAfter: number,
    actionType: 'approved' | 'rejected' | 'cancelled' | 'reactivated',
    previousStatus: string,
    newStatus: string,
    performedBy: 'teacher' | 'student' | 'system',
    reason?: string
  ): Promise<void> {
    try {
      // جلب teacher_subscription_id
      const subscriptionQuery = `
        SELECT id FROM teacher_subscriptions
        WHERE teacher_id = $1 AND is_active = true AND deleted_at IS NULL
        LIMIT 1
      `;
      const subscriptionResult = await pool.query(subscriptionQuery, [teacherId]);

      if (subscriptionResult.rows.length > 0) {
        const teacherSubscriptionId = subscriptionResult.rows[0].id;

        await BookingUsageLogModel.create({
          bookingId,
          teacherId,
          studentId,
          teacherSubscriptionId,
          actionType,
          previousStatus,
          newStatus,
          studentsBefore,
          studentsAfter,
          reason: reason || undefined,
          performedBy
        });
      }
    } catch (error) {
      // لا نريد أن يفشل تسجيل الاستخدام العملية الرئيسية
      console.error('Error logging booking usage:', error);
    }
  }

  // Get confirmed students for a course (by course_id)
  static async getConfirmedStudentIdsByCourse(courseId: string): Promise<string[]> {
    const q = `
      SELECT student_id
      FROM course_bookings
      WHERE course_id = $1 AND status = 'confirmed' AND is_deleted = false
    `;
    const r = await pool.query(q, [courseId]);
    return r.rows.map((row: any) => String(row.student_id));
  }

  // Get confirmed students with details (name, grade) for a course (teacher view)
  static async getConfirmedStudentsDetailedByCourse(courseId: string): Promise<Array<{ student_id: string; student_name: string; grade_id: string | null; grade_name: string | null; study_year: string | null }>> {
    const q = `
      SELECT
        cb.student_id::text,
        u.name AS student_name,
        sg.grade_id::text,
        g.name AS grade_name,
        sg.study_year::text
      FROM course_bookings cb
      JOIN users u
        ON u.id = cb.student_id
       AND u.user_type = 'student'
       AND u.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT sg.grade_id, sg.study_year, sg.updated_at
        FROM student_grades sg
        WHERE sg.student_id = cb.student_id
          AND sg.is_active = true
          AND sg.deleted_at IS NULL
        ORDER BY sg.updated_at DESC
        LIMIT 1
      ) sg ON true
      LEFT JOIN grades g ON g.id = sg.grade_id
      WHERE cb.course_id = $1 AND cb.status = 'confirmed' AND cb.is_deleted = false
      ORDER BY u.name ASC
    `;
    const r = await pool.query(q, [courseId]);
    return r.rows.map((row: any) => ({
      student_id: String(row.student_id),
      student_name: String(row.student_name),
      grade_id: row.grade_id ? String(row.grade_id) : null,
      grade_name: row.grade_name ? String(row.grade_name) : null,
      study_year: row.study_year ? String(row.study_year) : null,
    }));
  }
}
