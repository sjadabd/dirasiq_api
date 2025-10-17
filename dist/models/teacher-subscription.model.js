"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherSubscriptionModel = void 0;
const database_1 = __importDefault(require("../config/database"));
class TeacherSubscriptionModel {
    static async create(data) {
        const query = `
      INSERT INTO teacher_subscriptions (
        teacher_id, subscription_package_id, start_date, end_date
      ) VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
        const values = [data.teacherId, data.subscriptionPackageId, data.startDate, data.endDate];
        const result = await database_1.default.query(query, values);
        return this.mapDbToModel(result.rows[0]);
    }
    static async findById(id) {
        const query = `
      SELECT * FROM teacher_subscriptions
      WHERE id = $1 AND deleted_at IS NULL
    `;
        const result = await database_1.default.query(query, [id]);
        if (result.rows.length === 0)
            return null;
        return this.mapDbToModel(result.rows[0]);
    }
    static async findByTeacherId(teacherId) {
        const query = `
      SELECT * FROM teacher_subscriptions
      WHERE teacher_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;
        const result = await database_1.default.query(query, [teacherId]);
        return result.rows.map(this.mapDbToModel);
    }
    static async findActiveByTeacherId(teacherId) {
        const query = `
      SELECT * FROM teacher_subscriptions
      WHERE teacher_id = $1 AND is_active = true AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
        const result = await database_1.default.query(query, [teacherId]);
        if (result.rows.length === 0)
            return null;
        return this.mapDbToModel(result.rows[0]);
    }
    static async update(id, updateData) {
        const allowedFields = ['subscription_package_id', 'start_date', 'end_date', 'is_active', 'deleted_at'];
        const updates = [];
        const values = [];
        let paramCount = 1;
        for (const [key, value] of Object.entries(updateData)) {
            if (allowedFields.includes(key) && value !== undefined) {
                updates.push(`${key} = $${paramCount}`);
                values.push(value);
                paramCount++;
            }
        }
        if (updates.length === 0)
            return null;
        updates.push(`updated_at = $${paramCount}`);
        values.push(new Date());
        values.push(id);
        const query = `
      UPDATE teacher_subscriptions
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
        const result = await database_1.default.query(query, values);
        if (result.rows.length === 0)
            return null;
        return this.mapDbToModel(result.rows[0]);
    }
    static async delete(id) {
        const query = `
      UPDATE teacher_subscriptions
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `;
        const result = await database_1.default.query(query, [id]);
        return (result.rowCount || 0) > 0;
    }
    static async findAll(params) {
        const page = params.page || 1;
        const limit = params.limit || 10;
        const offset = (page - 1) * limit;
        let whereClause = params.deleted ? 'WHERE deleted_at IS NOT NULL' : 'WHERE deleted_at IS NULL';
        let searchClause = '';
        const searchValues = [];
        if (params.search) {
            searchClause = `AND CAST(teacher_id AS TEXT) ILIKE $1`;
            searchValues.push(`%${params.search}%`);
        }
        const sortKey = params.sortBy?.key || 'created_at';
        const sortOrder = params.sortBy?.order || 'desc';
        const countQuery = `
      SELECT COUNT(*) FROM teacher_subscriptions
      ${whereClause}
      ${searchClause}
    `;
        const dataQuery = `
      SELECT * FROM teacher_subscriptions
      ${whereClause}
      ${searchClause}
      ORDER BY ${sortKey} ${sortOrder.toUpperCase()}
      LIMIT $${searchValues.length + 1} OFFSET $${searchValues.length + 2}
    `;
        const countResult = await database_1.default.query(countQuery, searchValues);
        const total = parseInt(countResult.rows[0].count);
        const dataResult = await database_1.default.query(dataQuery, [...searchValues, limit, offset]);
        const subscriptions = dataResult.rows.map(this.mapDbToModel);
        return {
            subscriptions,
            total,
            totalPages: Math.ceil(total / limit)
        };
    }
    static async incrementCurrentStudents(teacherId) {
        const query = `
      UPDATE teacher_subscriptions
      SET current_students = current_students + 1, updated_at = CURRENT_TIMESTAMP
      WHERE teacher_id = $1 AND is_active = true AND deleted_at IS NULL
    `;
        const result = await database_1.default.query(query, [teacherId]);
        return (result.rowCount || 0) > 0;
    }
    static async decrementCurrentStudents(teacherId) {
        const query = `
      UPDATE teacher_subscriptions
      SET current_students = GREATEST(current_students - 1, 0), updated_at = CURRENT_TIMESTAMP
      WHERE teacher_id = $1 AND is_active = true AND deleted_at IS NULL
    `;
        const result = await database_1.default.query(query, [teacherId]);
        return (result.rowCount || 0) > 0;
    }
    static async canAddStudent(teacherId) {
        const query = `
      SELECT
        ts.current_students,
        sp.max_students,
        ts.end_date
      FROM teacher_subscriptions ts
      JOIN subscription_packages sp ON ts.subscription_package_id = sp.id
      WHERE ts.teacher_id = $1 AND ts.is_active = true AND ts.deleted_at IS NULL
    `;
        const result = await database_1.default.query(query, [teacherId]);
        if (result.rows.length === 0) {
            return {
                canAdd: false,
                currentStudents: 0,
                maxStudents: 0,
                message: 'لا يوجد اشتراك فعال للمعلم'
            };
        }
        const subscription = result.rows[0];
        const currentStudents = subscription.current_students || 0;
        const maxStudents = subscription.max_students;
        const endDate = new Date(subscription.end_date);
        if (endDate < new Date()) {
            return {
                canAdd: false,
                currentStudents,
                maxStudents,
                message: 'انتهت صلاحية الاشتراك'
            };
        }
        if (currentStudents >= maxStudents) {
            return {
                canAdd: false,
                currentStudents,
                maxStudents,
                message: 'الباقة ممتلئة. لا يمكنك قبول طلاب إضافيين'
            };
        }
        return {
            canAdd: true,
            currentStudents,
            maxStudents
        };
    }
    static async recalculateCurrentStudents(teacherId) {
        const query = `
      UPDATE teacher_subscriptions
      SET current_students = (
        SELECT COUNT(*)
        FROM course_bookings cb
        WHERE cb.teacher_id = teacher_subscriptions.teacher_id
        AND cb.status = 'confirmed'
        AND cb.is_deleted = false
        AND cb.created_at >= teacher_subscriptions.start_date
        AND cb.created_at <= teacher_subscriptions.end_date
      ), updated_at = CURRENT_TIMESTAMP
      WHERE teacher_id = $1 AND is_active = true AND deleted_at IS NULL
      RETURNING current_students
    `;
        const result = await database_1.default.query(query, [teacherId]);
        return result.rows.length > 0 ? result.rows[0].current_students : 0;
    }
    static mapDbToModel(row) {
        return {
            id: row.id,
            teacherId: row.teacher_id,
            subscriptionPackageId: row.subscription_package_id,
            startDate: row.start_date,
            endDate: row.end_date,
            isActive: row.is_active,
            currentStudents: row.current_students || 0,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            deletedAt: row.deleted_at ?? undefined,
        };
    }
}
exports.TeacherSubscriptionModel = TeacherSubscriptionModel;
//# sourceMappingURL=teacher-subscription.model.js.map