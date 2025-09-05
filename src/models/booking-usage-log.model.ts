import pool from '@/config/database';

export interface BookingUsageLog {
  id: string;
  bookingId: string;
  teacherId: string;
  studentId: string;
  teacherSubscriptionId: string;
  actionType: 'approved' | 'rejected' | 'cancelled' | 'reactivated';
  previousStatus?: string;
  newStatus: string;
  studentsBefore: number;
  studentsAfter: number;
  reason?: string;
  performedBy: 'teacher' | 'student' | 'system';
  createdAt: Date;
}

export interface CreateBookingUsageLogRequest {
  bookingId: string;
  teacherId: string;
  studentId: string;
  teacherSubscriptionId: string;
  actionType: 'approved' | 'rejected' | 'cancelled' | 'reactivated';
  previousStatus?: string;
  newStatus: string;
  studentsBefore: number;
  studentsAfter: number;
  reason?: string | undefined;
  performedBy: 'teacher' | 'student' | 'system';
}

export class BookingUsageLogModel {
  // إنشاء سجل استخدام جديد
  static async create(data: CreateBookingUsageLogRequest): Promise<BookingUsageLog> {
    const query = `
      SELECT log_booking_usage(
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      ) as log_id
    `;

    const values = [
      data.bookingId,
      data.teacherId,
      data.studentId,
      data.teacherSubscriptionId,
      data.actionType,
      data.previousStatus || null,
      data.newStatus,
      data.studentsBefore,
      data.studentsAfter,
      data.reason || null,
      data.performedBy
    ];

    const result = await pool.query(query, values);
    const logId = result.rows[0].log_id;

    return this.findById(logId) as Promise<BookingUsageLog>;
  }

  // جلب السجل حسب ID
  static async findById(id: string): Promise<BookingUsageLog | null> {
    const query = 'SELECT * FROM booking_usage_logs WHERE id = $1';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) return null;
    return this.mapDbToModel(result.rows[0]);
  }

  // جلب سجلات استخدام معلم معين
  static async findByTeacherId(
    teacherId: string,
    page: number = 1,
    limit: number = 10,
    actionType?: string
  ): Promise<{ logs: BookingUsageLog[]; total: number; totalPages: number }> {
    const offset = (page - 1) * limit;
    let whereClause = 'WHERE teacher_id = $1';
    let params: any[] = [teacherId];
    let paramIndex = 2;

    if (actionType) {
      whereClause += ` AND action_type = $${paramIndex}`;
      params.push(actionType);
      paramIndex++;
    }

    const countQuery = `SELECT COUNT(*) FROM booking_usage_logs ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    const dataQuery = `
      SELECT * FROM booking_usage_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);
    const result = await pool.query(dataQuery, params);

    const logs = result.rows.map(row => this.mapDbToModel(row));

    return {
      logs,
      total,
      totalPages: Math.ceil(total / limit)
    };
  }

  // جلب سجلات استخدام اشتراك معين
  static async findBySubscriptionId(
    subscriptionId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ logs: BookingUsageLog[]; total: number; totalPages: number }> {
    const offset = (page - 1) * limit;

    const countQuery = 'SELECT COUNT(*) FROM booking_usage_logs WHERE teacher_subscription_id = $1';
    const countResult = await pool.query(countQuery, [subscriptionId]);
    const total = parseInt(countResult.rows[0].count);

    const dataQuery = `
      SELECT * FROM booking_usage_logs
      WHERE teacher_subscription_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(dataQuery, [subscriptionId, limit, offset]);
    const logs = result.rows.map(row => this.mapDbToModel(row));

    return {
      logs,
      total,
      totalPages: Math.ceil(total / limit)
    };
  }

  // جلب إحصائيات استخدام المعلم
  static async getTeacherUsageStats(teacherId: string): Promise<{
    totalApprovals: number;
    totalRejections: number;
    totalCancellations: number;
    totalReactivations: number;
    currentStudents: number;
    maxStudents: number;
  }> {
    const query = `
      SELECT
        action_type,
        COUNT(*) as count
      FROM booking_usage_logs
      WHERE teacher_id = $1
      GROUP BY action_type
    `;

    const result = await pool.query(query, [teacherId]);

    const stats = {
      totalApprovals: 0,
      totalRejections: 0,
      totalCancellations: 0,
      totalReactivations: 0,
      currentStudents: 0,
      maxStudents: 0
    };

    result.rows.forEach(row => {
      switch (row.action_type) {
        case 'approved':
          stats.totalApprovals = parseInt(row.count);
          break;
        case 'rejected':
          stats.totalRejections = parseInt(row.count);
          break;
        case 'cancelled':
          stats.totalCancellations = parseInt(row.count);
          break;
        case 'reactivated':
          stats.totalReactivations = parseInt(row.count);
          break;
      }
    });

    // جلب معلومات الاشتراك الحالي
    const subscriptionQuery = `
      SELECT
        ts.current_students,
        sp.max_students
      FROM teacher_subscriptions ts
      JOIN subscription_packages sp ON ts.subscription_package_id = sp.id
      WHERE ts.teacher_id = $1 AND ts.is_active = true AND ts.deleted_at IS NULL
    `;

    const subscriptionResult = await pool.query(subscriptionQuery, [teacherId]);
    if (subscriptionResult.rows.length > 0) {
      stats.currentStudents = subscriptionResult.rows[0].current_students || 0;
      stats.maxStudents = subscriptionResult.rows[0].max_students || 0;
    }

    return stats;
  }

  // جلب آخر السجلات
  static async getRecentLogs(
    limit: number = 50
  ): Promise<BookingUsageLog[]> {
    const query = `
      SELECT * FROM booking_usage_logs
      ORDER BY created_at DESC
      LIMIT $1
    `;

    const result = await pool.query(query, [limit]);
    return result.rows.map(row => this.mapDbToModel(row));
  }

  // محول من DB إلى واجهة TypeScript
  private static mapDbToModel(row: any): BookingUsageLog {
    return {
      id: row.id,
      bookingId: row.booking_id,
      teacherId: row.teacher_id,
      studentId: row.student_id,
      teacherSubscriptionId: row.teacher_subscription_id,
      actionType: row.action_type,
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      studentsBefore: row.students_before,
      studentsAfter: row.students_after,
      reason: row.reason,
      performedBy: row.performed_by,
      createdAt: row.created_at
    };
  }
}
