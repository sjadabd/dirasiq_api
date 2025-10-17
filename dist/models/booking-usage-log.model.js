"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingUsageLogModel = void 0;
const database_1 = __importDefault(require("../config/database"));
class BookingUsageLogModel {
    static async create(data) {
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
        const result = await database_1.default.query(query, values);
        const logId = result.rows[0].log_id;
        return this.findById(logId);
    }
    static async findById(id) {
        const query = 'SELECT * FROM booking_usage_logs WHERE id = $1';
        const result = await database_1.default.query(query, [id]);
        if (result.rows.length === 0)
            return null;
        return this.mapDbToModel(result.rows[0]);
    }
    static async findByTeacherId(teacherId, page = 1, limit = 10, actionType) {
        const offset = (page - 1) * limit;
        let whereClause = 'WHERE teacher_id = $1';
        let params = [teacherId];
        let paramIndex = 2;
        if (actionType) {
            whereClause += ` AND action_type = $${paramIndex}`;
            params.push(actionType);
            paramIndex++;
        }
        const countQuery = `SELECT COUNT(*) FROM booking_usage_logs ${whereClause}`;
        const countResult = await database_1.default.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);
        const dataQuery = `
      SELECT * FROM booking_usage_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
        params.push(limit, offset);
        const result = await database_1.default.query(dataQuery, params);
        const logs = result.rows.map(row => this.mapDbToModel(row));
        return {
            logs,
            total,
            totalPages: Math.ceil(total / limit)
        };
    }
    static async findBySubscriptionId(subscriptionId, page = 1, limit = 10) {
        const offset = (page - 1) * limit;
        const countQuery = 'SELECT COUNT(*) FROM booking_usage_logs WHERE teacher_subscription_id = $1';
        const countResult = await database_1.default.query(countQuery, [subscriptionId]);
        const total = parseInt(countResult.rows[0].count);
        const dataQuery = `
      SELECT * FROM booking_usage_logs
      WHERE teacher_subscription_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
        const result = await database_1.default.query(dataQuery, [subscriptionId, limit, offset]);
        const logs = result.rows.map(row => this.mapDbToModel(row));
        return {
            logs,
            total,
            totalPages: Math.ceil(total / limit)
        };
    }
    static async getTeacherUsageStats(teacherId) {
        const query = `
      SELECT
        action_type,
        COUNT(*) as count
      FROM booking_usage_logs
      WHERE teacher_id = $1
      GROUP BY action_type
    `;
        const result = await database_1.default.query(query, [teacherId]);
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
        const subscriptionQuery = `
      SELECT
        ts.current_students,
        sp.max_students
      FROM teacher_subscriptions ts
      JOIN subscription_packages sp ON ts.subscription_package_id = sp.id
      WHERE ts.teacher_id = $1 AND ts.is_active = true AND ts.deleted_at IS NULL
    `;
        const subscriptionResult = await database_1.default.query(subscriptionQuery, [teacherId]);
        if (subscriptionResult.rows.length > 0) {
            stats.currentStudents = subscriptionResult.rows[0].current_students || 0;
            stats.maxStudents = subscriptionResult.rows[0].max_students || 0;
        }
        return stats;
    }
    static async getRecentLogs(limit = 50) {
        const query = `
      SELECT * FROM booking_usage_logs
      ORDER BY created_at DESC
      LIMIT $1
    `;
        const result = await database_1.default.query(query, [limit]);
        return result.rows.map(row => this.mapDbToModel(row));
    }
    static mapDbToModel(row) {
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
exports.BookingUsageLogModel = BookingUsageLogModel;
//# sourceMappingURL=booking-usage-log.model.js.map