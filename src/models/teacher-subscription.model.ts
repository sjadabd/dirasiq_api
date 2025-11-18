import pool from '../config/database';
import {
  CreateTeacherSubscriptionRequest,
  TeacherSubscription,
  UpdateTeacherSubscriptionRequest,
} from '../types';

export class TeacherSubscriptionModel {
  // إنشاء اشتراك جديد
  static async create(
    data: CreateTeacherSubscriptionRequest
  ): Promise<TeacherSubscription> {
    const query = `
      INSERT INTO teacher_subscriptions (
        teacher_id, subscription_package_id, start_date, end_date
      ) VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const values = [
      data.teacherId,
      data.subscriptionPackageId,
      data.startDate,
      data.endDate,
    ];
    const result = await pool.query(query, values);

    return this.mapDbToModel(result.rows[0]);
  }

  // جلب الاشتراك حسب ID
  static async findById(id: string): Promise<TeacherSubscription | null> {
    const query = `
      SELECT * FROM teacher_subscriptions
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) return null;
    return this.mapDbToModel(result.rows[0]);
  }

  // جلب كل الاشتراكات لمعلم معين
  static async findByTeacherId(
    teacherId: string
  ): Promise<TeacherSubscription[]> {
    const query = `
      SELECT * FROM teacher_subscriptions
      WHERE teacher_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query, [teacherId]);
    return result.rows.map(this.mapDbToModel);
  }

  // جلب الاشتراك الفعّال للمعلم
  static async findActiveByTeacherId(
    teacherId: string
  ): Promise<TeacherSubscription | null> {
    const query = `
      SELECT * FROM teacher_subscriptions
      WHERE teacher_id = $1 AND is_active = true AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const result = await pool.query(query, [teacherId]);
    if (result.rows.length === 0) return null;
    return this.mapDbToModel(result.rows[0]);
  }

  // تحديث اشتراك
  static async update(
    id: string,
    updateData: UpdateTeacherSubscriptionRequest
  ): Promise<TeacherSubscription | null> {
    const allowedFields = [
      'subscription_package_id',
      'start_date',
      'end_date',
      'is_active',
      'deleted_at',
    ];
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updates.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (updates.length === 0) return null;

    updates.push(`updated_at = $${paramCount}`);
    values.push(new Date());
    values.push(id);

    const query = `
      UPDATE teacher_subscriptions
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    if (result.rows.length === 0) return null;

    return this.mapDbToModel(result.rows[0]);
  }

  // حذف ناعم (soft delete)
  static async delete(id: string): Promise<boolean> {
    const query = `
      UPDATE teacher_subscriptions
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const result = await pool.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  // جلب الكل مع pagination
  static async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: { key: string; order: 'asc' | 'desc' };
    deleted?: boolean;
  }): Promise<{
    subscriptions: TeacherSubscription[];
    total: number;
    totalPages: number;
  }> {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const offset = (page - 1) * limit;

    let whereClause = params.deleted
      ? 'WHERE deleted_at IS NOT NULL'
      : 'WHERE deleted_at IS NULL';
    let searchClause = '';
    const searchValues: any[] = [];

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

    const countResult = await pool.query(countQuery, searchValues);
    const total = parseInt(countResult.rows[0].count);

    const dataResult = await pool.query(dataQuery, [
      ...searchValues,
      limit,
      offset,
    ]);
    const subscriptions = dataResult.rows.map(this.mapDbToModel);

    return {
      subscriptions,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  // زيادة عدد الطلاب الحاليين
  static async incrementCurrentStudents(teacherId: string): Promise<boolean> {
    const query = `
      UPDATE teacher_subscriptions
      SET current_students = current_students + 1, updated_at = CURRENT_TIMESTAMP
      WHERE teacher_id = $1 AND is_active = true AND deleted_at IS NULL
    `;
    const result = await pool.query(query, [teacherId]);
    return (result.rowCount || 0) > 0;
  }

  // تقليل عدد الطلاب الحاليين
  static async decrementCurrentStudents(teacherId: string): Promise<boolean> {
    const query = `
      UPDATE teacher_subscriptions
      SET current_students = GREATEST(current_students - 1, 0), updated_at = CURRENT_TIMESTAMP
      WHERE teacher_id = $1 AND is_active = true AND deleted_at IS NULL
    `;
    const result = await pool.query(query, [teacherId]);
    return (result.rowCount || 0) > 0;
  }

  // التحقق من إمكانية إضافة طالب جديد (التحقق من السعة)
  static async canAddStudent(
    teacherId: string
  ): Promise<{
    canAdd: boolean;
    currentStudents: number;
    maxStudents: number;
    message?: string;
  }> {
    const query = `
      SELECT
        ts.id AS subscription_id,
        ts.current_students,
        sp.max_students,
        ts.end_date,
        COALESCE(
          (
            SELECT SUM(bonus_value)
            FROM teacher_subscription_bonuses b
            WHERE b.teacher_subscription_id = ts.id
              AND (b.expires_at IS NULL OR b.expires_at > NOW())
          ),
          0
        ) AS bonus_students
      FROM teacher_subscriptions ts
      JOIN subscription_packages sp ON ts.subscription_package_id = sp.id
      WHERE ts.teacher_id = $1 AND ts.is_active = true AND ts.deleted_at IS NULL
    `;

    const result = await pool.query(query, [teacherId]);

    if (result.rows.length === 0) {
      return {
        canAdd: false,
        currentStudents: 0,
        maxStudents: 0,
        message: 'لا يوجد اشتراك فعال للمعلم',
      };
    }

    const subscription = result.rows[0];
    const currentStudents = subscription.current_students || 0;
    const baseMaxStudents = subscription.max_students;
    const bonusStudents = subscription.bonus_students || 0;
    const maxStudents = baseMaxStudents + bonusStudents;
    const endDate = new Date(subscription.end_date);

    // التحقق من انتهاء صلاحية الاشتراك
    if (endDate < new Date()) {
      return {
        canAdd: false,
        currentStudents,
        maxStudents,
        message: 'انتهت صلاحية الاشتراك',
      };
    }

    // التحقق من السعة
    if (currentStudents >= maxStudents) {
      return {
        canAdd: false,
        currentStudents,
        maxStudents,
        message: 'الباقة ممتلئة. لا يمكنك قبول طلاب إضافيين',
      };
    }

    return {
      canAdd: true,
      currentStudents,
      maxStudents,
    };
  }

  // إعادة حساب عدد الطلاب الحاليين من الحجوزات المعتمدة
  static async recalculateCurrentStudents(teacherId: string): Promise<number> {
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

    const result = await pool.query(query, [teacherId]);
    return result.rows.length > 0 ? result.rows[0].current_students : 0;
  }

  // محول من DB إلى واجهة TypeScript
  private static mapDbToModel(row: any): TeacherSubscription {
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
