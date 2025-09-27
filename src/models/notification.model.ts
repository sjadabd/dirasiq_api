import pool from '@/config/database';

export enum NotificationType {
  HOMEWORK_REMINDER = 'homework_reminder',
  COURSE_UPDATE = 'course_update',
  BOOKING_CONFIRMATION = 'booking_confirmation',
  BOOKING_CANCELLATION = 'booking_cancellation',
  NEW_BOOKING = 'new_booking',
  PAYMENT_REMINDER = 'payment_reminder',
  SYSTEM_ANNOUNCEMENT = 'system_announcement',
  GRADE_UPDATE = 'grade_update',
  ASSIGNMENT_DUE = 'assignment_due',
  CLASS_REMINDER = 'class_reminder',
  TEACHER_MESSAGE = 'teacher_message',
  PARENT_NOTIFICATION = 'parent_notification',
  SUBSCRIPTION_EXPIRY = 'subscription_expiry',
  NEW_COURSE_AVAILABLE = 'new_course_available',
  COURSE_COMPLETION = 'course_completion',
  FEEDBACK_REQUEST = 'feedback_request'
}

export enum NotificationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed'
}

export enum RecipientType {
  ALL = 'all',
  TEACHERS = 'teachers',
  STUDENTS = 'students',
  SPECIFIC_TEACHERS = 'specific_teachers',
  SPECIFIC_STUDENTS = 'specific_students',
  PARENTS = 'parents'
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  status: NotificationStatus;
  recipientType: RecipientType;
  recipientIds?: string[]; // Array of user IDs for specific recipients
  data?: Record<string, any>; // Additional data for the notification
  scheduledAt?: Date;
  sentAt?: Date;
  readAt?: Date;
  createdBy: string; // ID of the user who created the notification
  createdAt: Date;
  updatedAt: Date;
  // Per-user computed flag (not stored directly on notifications table)
  isRead?: boolean;
}

export interface CreateNotificationData {
  title: string;
  message: string;
  type: NotificationType;
  priority?: NotificationPriority;
  recipientType: RecipientType;
  recipientIds?: string[];
  data?: Record<string, any>;
  scheduledAt?: Date;
  createdBy: string;
}

export interface NotificationFilters {
  type?: NotificationType;
  status?: NotificationStatus;
  priority?: NotificationPriority;
  recipientType?: RecipientType;
  createdBy?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
}

export class NotificationModel {
  // Create a new notification
  static async create(notificationData: CreateNotificationData): Promise<Notification> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO notifications (
          title, message, type, priority, status, recipient_type,
          recipient_ids, data, scheduled_at, created_by, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12
        ) RETURNING *;
      `;

      const values = [
        notificationData.title,
        notificationData.message,
        notificationData.type,
        notificationData.priority || NotificationPriority.MEDIUM,
        NotificationStatus.PENDING,
        notificationData.recipientType,
        notificationData.recipientIds ? JSON.stringify(notificationData.recipientIds) : null,
        notificationData.data ? JSON.stringify(notificationData.data) : null,
        notificationData.scheduledAt || new Date(),
        notificationData.createdBy,
        new Date(),
        new Date()
      ];

      const result = await client.query(query, values);
      await client.query('COMMIT');
      return this.mapDatabaseNotificationToNotification(result.rows[0]);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get notification by ID
  static async findById(id: string): Promise<Notification | null> {
    const query = 'SELECT * FROM notifications WHERE id = $1';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDatabaseNotificationToNotification(result.rows[0]);
  }

  // Get notifications with filters and pagination
  static async findMany(filters: NotificationFilters = {}): Promise<{
    notifications: Notification[];
    total: number;
    totalPages: number;
  }> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const values: any[] = [];
    let paramCount = 1;

    if (filters.type) {
      whereClause += ` AND type = $${paramCount}`;
      values.push(filters.type);
      paramCount++;
    }

    if (filters.status) {
      whereClause += ` AND status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    if (filters.priority) {
      whereClause += ` AND priority = $${paramCount}`;
      values.push(filters.priority);
      paramCount++;
    }

    if (filters.recipientType) {
      whereClause += ` AND recipient_type = $${paramCount}`;
      values.push(filters.recipientType);
      paramCount++;
    }

    if (filters.createdBy) {
      whereClause += ` AND created_by = $${paramCount}`;
      values.push(filters.createdBy);
      paramCount++;
    }

    if (filters.dateFrom) {
      whereClause += ` AND created_at >= $${paramCount}`;
      values.push(filters.dateFrom);
      paramCount++;
    }

    if (filters.dateTo) {
      whereClause += ` AND created_at <= $${paramCount}`;
      values.push(filters.dateTo);
      paramCount++;
    }

    const countQuery = `SELECT COUNT(*) FROM notifications ${whereClause}`;
    const dataQuery = `
      SELECT * FROM notifications
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count);

    const dataResult = await pool.query(dataQuery, [...values, limit, offset]);
    const notifications = dataResult.rows.map((row: any) => {
      const notif = this.mapDatabaseNotificationToNotification(row);
      const userReadAt = row.user_read_at as Date | null;
      return {
        ...notif,
        readAt: userReadAt || notif.readAt || undefined,
        isRead: !!userReadAt
      } as Notification;
    });

    return {
      notifications,
      total,
      totalPages: Math.ceil(total / limit)
    };
  }

  // Update notification status
  static async updateStatus(
    id: string,
    status: NotificationStatus,
    additionalData?: { sentAt?: Date; readAt?: Date }
  ): Promise<Notification | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let updateFields = ['status = $1', 'updated_at = $2'];
      const values: any[] = [status, new Date()];
      let paramCount = 3;

      if (additionalData?.sentAt) {
        updateFields.push(`sent_at = $${paramCount}`);
        values.push(additionalData.sentAt);
        paramCount++;
      }

      if (additionalData?.readAt) {
        updateFields.push(`read_at = $${paramCount}`);
        values.push(additionalData.readAt);
        paramCount++;
      }

      values.push(id);

      const query = `
        UPDATE notifications
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await client.query(query, values);
      await client.query('COMMIT');

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDatabaseNotificationToNotification(result.rows[0]);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get pending notifications that should be sent
  static async getPendingNotifications(): Promise<Notification[]> {
    const query = `
      SELECT * FROM notifications
      WHERE status = $1
        AND scheduled_at <= $2
      ORDER BY priority DESC, created_at ASC
    `;

    const result = await pool.query(query, [NotificationStatus.PENDING, new Date()]);
    return result.rows.map((row: any) => this.mapDatabaseNotificationToNotification(row));
  }

  // Get notifications for a specific user
  static async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ notifications: Notification[]; total: number; totalPages: number }> {
    const offset = (page - 1) * limit;

    // Get notifications where user is in recipient_ids or recipient_type includes their user type
    const query = `
      SELECT 
        n.*,
        u.user_type,
        un.read_at as user_read_at
      FROM notifications n
      LEFT JOIN users u ON u.id = $1
      LEFT JOIN user_notifications un ON un.notification_id = n.id AND un.user_id = $1
      WHERE (
        n.recipient_type = 'all' OR
        (n.recipient_type = 'teachers' AND u.user_type = 'teacher') OR
        (n.recipient_type = 'students' AND u.user_type = 'student') OR
        (n.recipient_type = 'specific_teachers' AND u.user_type = 'teacher' AND $1 = ANY(
          SELECT jsonb_array_elements_text(n.recipient_ids::jsonb)::uuid
        )) OR
        (n.recipient_type = 'specific_students' AND u.user_type = 'student' AND $1 = ANY(
          SELECT jsonb_array_elements_text(n.recipient_ids::jsonb)::uuid
        ))
      )
      AND n.status IN ('sent', 'delivered')
      ORDER BY n.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `
      SELECT COUNT(*)
      FROM notifications n
      LEFT JOIN users u ON u.id = $1
      WHERE (
        n.recipient_type = 'all' OR
        (n.recipient_type = 'teachers' AND u.user_type = 'teacher') OR
        (n.recipient_type = 'students' AND u.user_type = 'student') OR
        (n.recipient_type = 'specific_teachers' AND u.user_type = 'teacher' AND $1 = ANY(
          SELECT jsonb_array_elements_text(n.recipient_ids::jsonb)::uuid
        )) OR
        (n.recipient_type = 'specific_students' AND u.user_type = 'student' AND $1 = ANY(
          SELECT jsonb_array_elements_text(n.recipient_ids::jsonb)::uuid
        ))
      )
      AND n.status IN ('sent', 'delivered')
    `;

    const countResult = await pool.query(countQuery, [userId]);
    const total = parseInt(countResult.rows[0].count);

    const dataResult = await pool.query(query, [userId, limit, offset]);
    const notifications = dataResult.rows.map((row: any) =>
      this.mapDatabaseNotificationToNotification(row)
    );

    return {
      notifications,
      total,
      totalPages: Math.ceil(total / limit)
    };
  }

  // Mark notification as read for a user
  static async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    // Upsert into user_notifications to track per-user read status
    const query = `
      INSERT INTO user_notifications (user_id, notification_id, read_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, notification_id)
      DO UPDATE SET read_at = EXCLUDED.read_at
    `;

    const result = await pool.query(query, [userId, notificationId, new Date()]);
    return (result.rowCount || 0) > 0;
  }

  // Delete notification
  static async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM notifications WHERE id = $1';
    const result = await pool.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }


  // Get notification statistics
  static async getStatistics(): Promise<{
    total: number;
    sent: number;
    pending: number;
    failed: number;
    byType: Record<NotificationType, number>;
    byPriority: Record<NotificationPriority, number>;
  }> {
    const totalQuery = 'SELECT COUNT(*) FROM notifications';
    const statusQuery = `
      SELECT status, COUNT(*) as count
      FROM notifications
      GROUP BY status
    `;
    const typeQuery = `
      SELECT type, COUNT(*) as count
      FROM notifications
      GROUP BY type
    `;
    const priorityQuery = `
      SELECT priority, COUNT(*) as count
      FROM notifications
      GROUP BY priority
    `;

    const [totalResult, statusResult, typeResult, priorityResult] = await Promise.all([
      pool.query(totalQuery),
      pool.query(statusQuery),
      pool.query(typeQuery),
      pool.query(priorityQuery)
    ]);

    const total = parseInt(totalResult.rows[0].count);

    const statusCounts = statusResult.rows.reduce((acc: any, row: any) => {
      acc[row.status] = parseInt(row.count);
      return acc;
    }, {});

    const typeCounts = typeResult.rows.reduce((acc: any, row: any) => {
      acc[row.type] = parseInt(row.count);
      return acc;
    }, {});

    const priorityCounts = priorityResult.rows.reduce((acc: any, row: any) => {
      acc[row.priority] = parseInt(row.count);
      return acc;
    }, {});

    return {
      total,
      sent: statusCounts.sent || 0,
      pending: statusCounts.pending || 0,
      failed: statusCounts.failed || 0,
      byType: typeCounts,
      byPriority: priorityCounts
    };
  }

  // Map database notification to Notification interface
  private static mapDatabaseNotificationToNotification(dbNotification: any): Notification {
    return {
      id: dbNotification.id,
      title: dbNotification.title,
      message: dbNotification.message,
      type: dbNotification.type as NotificationType,
      priority: dbNotification.priority as NotificationPriority,
      status: dbNotification.status as NotificationStatus,
      recipientType: dbNotification.recipient_type as RecipientType,
      recipientIds: dbNotification.recipient_ids || undefined,
      data: dbNotification.data || undefined,
      scheduledAt: dbNotification.scheduled_at,
      sentAt: dbNotification.sent_at,
      readAt: dbNotification.read_at,
      createdBy: dbNotification.created_by,
      createdAt: dbNotification.created_at,
      updatedAt: dbNotification.updated_at
    };
  }
}
