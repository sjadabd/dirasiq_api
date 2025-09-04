import pool from '@/config/database'
import {
  CreateTeacherSubscriptionRequest,
  TeacherSubscription,
  UpdateTeacherSubscriptionRequest,
} from '@/types'

export class TeacherSubscriptionModel {
  // إنشاء اشتراك جديد
  static async create(data: CreateTeacherSubscriptionRequest): Promise<TeacherSubscription> {
    const query = `
      INSERT INTO teacher_subscriptions (
        teacher_id, subscription_package_id, start_date, end_date
      ) VALUES ($1, $2, $3, $4)
      RETURNING *
    `

    const values = [data.teacherId, data.subscriptionPackageId, data.startDate, data.endDate]
    const result = await pool.query(query, values)

    return this.mapDbToModel(result.rows[0])
  }

  // جلب الاشتراك حسب ID
  static async findById(id: string): Promise<TeacherSubscription | null> {
    const query = `
      SELECT * FROM teacher_subscriptions
      WHERE id = $1 AND deleted_at IS NULL
    `
    const result = await pool.query(query, [id])
    if (result.rows.length === 0) return null
    return this.mapDbToModel(result.rows[0])
  }

  // جلب كل الاشتراكات لمعلم معين
  static async findByTeacherId(teacherId: string): Promise<TeacherSubscription[]> {
    const query = `
      SELECT * FROM teacher_subscriptions
      WHERE teacher_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
    `
    const result = await pool.query(query, [teacherId])
    return result.rows.map(this.mapDbToModel)
  }

  // جلب الاشتراك الفعّال للمعلم
  static async findActiveByTeacherId(teacherId: string): Promise<TeacherSubscription | null> {
    const query = `
      SELECT * FROM teacher_subscriptions
      WHERE teacher_id = $1 AND is_active = true AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `
    const result = await pool.query(query, [teacherId])
    if (result.rows.length === 0) return null
    return this.mapDbToModel(result.rows[0])
  }

  // تحديث اشتراك
  static async update(id: string, updateData: UpdateTeacherSubscriptionRequest): Promise<TeacherSubscription | null> {
    const allowedFields = ['subscription_package_id', 'start_date', 'end_date', 'is_active', 'deleted_at']
    const updates: string[] = []
    const values: any[] = []
    let paramCount = 1

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updates.push(`${key} = $${paramCount}`)
        values.push(value)
        paramCount++
      }
    }

    if (updates.length === 0) return null

    updates.push(`updated_at = $${paramCount}`)
    values.push(new Date())
    values.push(id)

    const query = `
      UPDATE teacher_subscriptions
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `

    const result = await pool.query(query, values)
    if (result.rows.length === 0) return null

    return this.mapDbToModel(result.rows[0])
  }

  // حذف ناعم (soft delete)
  static async delete(id: string): Promise<boolean> {
    const query = `
      UPDATE teacher_subscriptions
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `
    const result = await pool.query(query, [id])
    return (result.rowCount || 0) > 0
  }

  // جلب الكل مع pagination
  static async findAll(params: {
    page?: number
    limit?: number
    search?: string
    sortBy?: { key: string; order: 'asc' | 'desc' }
    deleted?: boolean
  }): Promise<{ subscriptions: TeacherSubscription[]; total: number; totalPages: number }> {
    const page = params.page || 1
    const limit = params.limit || 10
    const offset = (page - 1) * limit

    let whereClause = params.deleted ? 'WHERE deleted_at IS NOT NULL' : 'WHERE deleted_at IS NULL'
    let searchClause = ''
    const searchValues: any[] = []

    if (params.search) {
      searchClause = `AND CAST(teacher_id AS TEXT) ILIKE $1`
      searchValues.push(`%${params.search}%`)
    }

    const sortKey = params.sortBy?.key || 'created_at'
    const sortOrder = params.sortBy?.order || 'desc'

    const countQuery = `
      SELECT COUNT(*) FROM teacher_subscriptions
      ${whereClause}
      ${searchClause}
    `

    const dataQuery = `
      SELECT * FROM teacher_subscriptions
      ${whereClause}
      ${searchClause}
      ORDER BY ${sortKey} ${sortOrder.toUpperCase()}
      LIMIT $${searchValues.length + 1} OFFSET $${searchValues.length + 2}
    `

    const countResult = await pool.query(countQuery, searchValues)
    const total = parseInt(countResult.rows[0].count)

    const dataResult = await pool.query(dataQuery, [...searchValues, limit, offset])
    const subscriptions = dataResult.rows.map(this.mapDbToModel)

    return {
      subscriptions,
      total,
      totalPages: Math.ceil(total / limit)
    }
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? undefined,
    }
  }
}
