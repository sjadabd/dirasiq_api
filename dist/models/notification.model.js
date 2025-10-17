"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationModel = exports.RecipientType = exports.NotificationStatus = exports.NotificationPriority = exports.NotificationType = void 0;
const database_1 = __importDefault(require("../config/database"));
const academic_year_model_1 = require("../models/academic-year.model");
var NotificationType;
(function (NotificationType) {
    NotificationType["HOMEWORK_REMINDER"] = "homework_reminder";
    NotificationType["COURSE_UPDATE"] = "course_update";
    NotificationType["BOOKING_CONFIRMATION"] = "booking_confirmation";
    NotificationType["BOOKING_CANCELLATION"] = "booking_cancellation";
    NotificationType["NEW_BOOKING"] = "new_booking";
    NotificationType["PAYMENT_REMINDER"] = "payment_reminder";
    NotificationType["SYSTEM_ANNOUNCEMENT"] = "system_announcement";
    NotificationType["GRADE_UPDATE"] = "grade_update";
    NotificationType["ASSIGNMENT_DUE"] = "assignment_due";
    NotificationType["CLASS_REMINDER"] = "class_reminder";
    NotificationType["TEACHER_MESSAGE"] = "teacher_message";
    NotificationType["PARENT_NOTIFICATION"] = "parent_notification";
    NotificationType["SUBSCRIPTION_EXPIRY"] = "subscription_expiry";
    NotificationType["NEW_COURSE_AVAILABLE"] = "new_course_available";
    NotificationType["COURSE_COMPLETION"] = "course_completion";
    NotificationType["FEEDBACK_REQUEST"] = "feedback_request";
})(NotificationType || (exports.NotificationType = NotificationType = {}));
var NotificationPriority;
(function (NotificationPriority) {
    NotificationPriority["LOW"] = "low";
    NotificationPriority["MEDIUM"] = "medium";
    NotificationPriority["HIGH"] = "high";
    NotificationPriority["URGENT"] = "urgent";
})(NotificationPriority || (exports.NotificationPriority = NotificationPriority = {}));
var NotificationStatus;
(function (NotificationStatus) {
    NotificationStatus["PENDING"] = "pending";
    NotificationStatus["SENT"] = "sent";
    NotificationStatus["DELIVERED"] = "delivered";
    NotificationStatus["READ"] = "read";
    NotificationStatus["FAILED"] = "failed";
})(NotificationStatus || (exports.NotificationStatus = NotificationStatus = {}));
var RecipientType;
(function (RecipientType) {
    RecipientType["ALL"] = "all";
    RecipientType["TEACHERS"] = "teachers";
    RecipientType["STUDENTS"] = "students";
    RecipientType["SPECIFIC_TEACHERS"] = "specific_teachers";
    RecipientType["SPECIFIC_STUDENTS"] = "specific_students";
    RecipientType["PARENTS"] = "parents";
})(RecipientType || (exports.RecipientType = RecipientType = {}));
class NotificationModel {
    static async create(notificationData) {
        const client = await database_1.default.connect();
        try {
            await client.query('BEGIN');
            const query = `
        INSERT INTO notifications (
          title, message, type, priority, status, recipient_type,
          recipient_ids, data, study_year, scheduled_at, created_by, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12, $13
        ) RETURNING *;
      `;
            const values = [
                notificationData.title,
                notificationData.message,
                notificationData.type,
                notificationData.priority || NotificationPriority.MEDIUM,
                NotificationStatus.PENDING,
                notificationData.recipientType,
                notificationData.recipientIds
                    ? JSON.stringify(notificationData.recipientIds)
                    : null,
                notificationData.data ? JSON.stringify(notificationData.data) : null,
                notificationData.data?.studyYear || null,
                notificationData.scheduledAt || new Date(),
                notificationData.createdBy,
                new Date(),
                new Date(),
            ];
            const result = await client.query(query, values);
            await client.query('COMMIT');
            return this.mapDatabaseNotificationToNotification(result.rows[0]);
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    static async getUserNotificationsWithFilters(userId, options) {
        const activeYear = await academic_year_model_1.AcademicYearModel.getActive();
        const page = options.page && options.page > 0 ? options.page : 1;
        const limit = options.limit && options.limit > 0 ? options.limit : 10;
        const offset = (page - 1) * limit;
        let where = `(
      n.recipient_type = 'all' OR
      (n.recipient_type = 'teachers' AND u.user_type = 'teacher') OR
      (n.recipient_type = 'students' AND u.user_type = 'student') OR
      (n.recipient_type = 'specific_teachers' AND u.user_type = 'teacher' AND $1 = ANY(SELECT jsonb_array_elements_text(n.recipient_ids::jsonb)::uuid)) OR
      (n.recipient_type = 'specific_students' AND u.user_type = 'student' AND $1 = ANY(SELECT jsonb_array_elements_text(n.recipient_ids::jsonb)::uuid))
    )
    AND n.status IN ('sent', 'delivered', 'read')`;
        const values = [userId];
        let param = 2;
        if (options.type) {
            where += ` AND n.type = $${param}`;
            values.push(options.type);
            param++;
        }
        if (options.courseId) {
            where += ` AND (n.data->>'courseId') = $${param}`;
            values.push(String(options.courseId));
            param++;
        }
        if (activeYear?.year) {
            where += ` AND n.study_year = $${param}`;
            values.push(String(activeYear.year));
            param++;
        }
        if (options.subType) {
            where += ` AND (n.data->>'subType') = $${param}`;
            values.push(String(options.subType));
            param++;
        }
        if (options.q && options.q.trim() !== '') {
            where += ` AND (n.title ILIKE $${param} OR n.message ILIKE $${param})`;
            values.push(`%${options.q.trim()}%`);
            param++;
        }
        const countQuery = `
      SELECT COUNT(*)
      FROM notifications n
      LEFT JOIN users u ON u.id = $1
      WHERE ${where} AND n.deleted_at IS NULL
    `;
        const dataQuery = `
      SELECT n.*, u.user_type, un.read_at AS user_read_at,
        CASE WHEN un.read_at IS NOT NULL THEN true ELSE false END AS is_read
      FROM notifications n
      LEFT JOIN users u ON u.id = $1
      LEFT JOIN user_notifications un ON un.notification_id = n.id AND un.user_id = $1
      WHERE ${where} AND n.deleted_at IS NULL
      ORDER BY n.created_at DESC
      LIMIT $${param} OFFSET $${param + 1}
    `;
        const countRes = await database_1.default.query(countQuery, values);
        const total = parseInt(countRes.rows[0].count);
        const dataRes = await database_1.default.query(dataQuery, [...values, limit, offset]);
        const notifications = dataRes.rows.map((row) => ({
            ...row,
            is_read: !!row.is_read,
        }));
        return {
            notifications,
            total,
            totalPages: Math.ceil(total / limit),
        };
    }
    static async findById(id) {
        const query = 'SELECT * FROM notifications WHERE id = $1 AND deleted_at IS NULL';
        const result = await database_1.default.query(query, [id]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapDatabaseNotificationToNotification(result.rows[0]);
    }
    static async findMany(filters = {}) {
        const page = filters.page || 1;
        const limit = filters.limit || 10;
        const offset = (page - 1) * limit;
        const activeYear = await academic_year_model_1.AcademicYearModel.getActive();
        let whereClause = 'WHERE 1=1';
        const values = [];
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
        if (activeYear?.year) {
            whereClause += ` AND study_year = $${paramCount}`;
            values.push(String(activeYear.year));
            paramCount++;
        }
        const countQuery = `SELECT COUNT(*) FROM notifications ${whereClause} AND deleted_at IS NULL`;
        const dataQuery = `
      SELECT * FROM notifications
      ${whereClause} AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
        const countResult = await database_1.default.query(countQuery, values);
        const total = parseInt(countResult.rows[0].count);
        const dataResult = await database_1.default.query(dataQuery, [...values, limit, offset]);
        const notifications = dataResult.rows.map((row) => {
            const notif = this.mapDatabaseNotificationToNotification(row);
            const userReadAt = row.user_read_at;
            return {
                ...notif,
                readAt: userReadAt || notif.readAt || undefined,
                isRead: !!userReadAt,
            };
        });
        return {
            notifications,
            total,
            totalPages: Math.ceil(total / limit),
        };
    }
    static async updateStatus(id, status, additionalData) {
        const client = await database_1.default.connect();
        try {
            await client.query('BEGIN');
            let updateFields = ['status = $1', 'updated_at = $2'];
            const values = [status, new Date()];
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
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    static async getPendingNotifications() {
        const query = `
      SELECT * FROM notifications
      WHERE status = $1 AND deleted_at IS NULL
        AND scheduled_at <= $2
      ORDER BY priority DESC, created_at ASC
    `;
        const result = await database_1.default.query(query, [
            NotificationStatus.PENDING,
            new Date(),
        ]);
        return result.rows.map((row) => this.mapDatabaseNotificationToNotification(row));
    }
    static async getUserNotifications(userId, page = 1, limit = 10) {
        const offset = (page - 1) * limit;
        const activeYear = await academic_year_model_1.AcademicYearModel.getActive();
        const query = `
      SELECT
        n.*,
        u.user_type,
        un.read_at AS user_read_at,
        CASE
          WHEN un.read_at IS NOT NULL THEN true
          ELSE false
        END AS is_read
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
      AND n.status IN ('sent', 'delivered', 'read')
      ${activeYear?.year ? `AND n.study_year = $4` : ''}
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
      AND n.status IN ('sent', 'delivered', 'read')
      ${activeYear?.year ? `AND n.study_year = $2` : ''}
    `;
        const countParams = activeYear?.year ? [userId, activeYear.year] : [userId];
        const dataParams = activeYear?.year ? [userId, limit, offset, activeYear.year] : [userId, limit, offset];
        const countResult = await database_1.default.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);
        const dataResult = await database_1.default.query(query, dataParams);
        const notifications = dataResult.rows.map((row) => ({
            ...row,
            is_read: row.is_read,
        }));
        return {
            notifications,
            total,
            totalPages: Math.ceil(total / limit),
        };
    }
    static async markAsRead(notificationId, userId) {
        const checkQuery = `SELECT id, status, read_at FROM notifications WHERE id = $1`;
        const checkResult = await database_1.default.query(checkQuery, [notificationId]);
        if (checkResult.rowCount === 0) {
            return false;
        }
        const now = new Date();
        const queryUser = `
      INSERT INTO user_notifications (user_id, notification_id, read_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, notification_id)
      DO UPDATE SET read_at = CASE
        WHEN user_notifications.read_at IS NULL THEN EXCLUDED.read_at
        ELSE user_notifications.read_at
      END
    `;
        await database_1.default.query(queryUser, [userId, notificationId, now]);
        const queryNotif = `
      UPDATE notifications
      SET status = 'read',
          read_at = COALESCE(read_at, $2),
          updated_at = NOW()
      WHERE id = $1
    `;
        await database_1.default.query(queryNotif, [notificationId, now]);
        return true;
    }
    static async delete(id) {
        const query = 'DELETE FROM notifications WHERE id = $1';
        const result = await database_1.default.query(query, [id]);
        return (result.rowCount || 0) > 0;
    }
    static async softDeleteByAssignmentId(assignmentId) {
        const query = `
      UPDATE notifications
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE (data->>'assignmentId') = $1 AND deleted_at IS NULL
    `;
        const result = await database_1.default.query(query, [assignmentId]);
        return result.rowCount || 0;
    }
    static async getStatistics() {
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
            database_1.default.query(totalQuery),
            database_1.default.query(statusQuery),
            database_1.default.query(typeQuery),
            database_1.default.query(priorityQuery),
        ]);
        const total = parseInt(totalResult.rows[0].count);
        const statusCounts = statusResult.rows.reduce((acc, row) => {
            acc[row.status] = parseInt(row.count);
            return acc;
        }, {});
        const typeCounts = typeResult.rows.reduce((acc, row) => {
            acc[row.type] = parseInt(row.count);
            return acc;
        }, {});
        const priorityCounts = priorityResult.rows.reduce((acc, row) => {
            acc[row.priority] = parseInt(row.count);
            return acc;
        }, {});
        return {
            total,
            sent: statusCounts.sent || 0,
            pending: statusCounts.pending || 0,
            failed: statusCounts.failed || 0,
            byType: typeCounts,
            byPriority: priorityCounts,
        };
    }
    static mapDatabaseNotificationToNotification(dbNotification) {
        return {
            id: dbNotification.id,
            title: dbNotification.title,
            message: dbNotification.message,
            type: dbNotification.type,
            priority: dbNotification.priority,
            status: dbNotification.status,
            recipientType: dbNotification.recipient_type,
            recipientIds: dbNotification.recipient_ids || undefined,
            data: dbNotification.data || undefined,
            studyYear: dbNotification.study_year || undefined,
            scheduledAt: dbNotification.scheduled_at,
            sentAt: dbNotification.sent_at,
            readAt: dbNotification.read_at,
            createdBy: dbNotification.created_by,
            createdAt: dbNotification.created_at,
            updatedAt: dbNotification.updated_at,
        };
    }
}
exports.NotificationModel = NotificationModel;
//# sourceMappingURL=notification.model.js.map