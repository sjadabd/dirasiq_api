import pool from '@/config/database';
import { CreateSubscriptionPackageRequest, SubscriptionPackage, UpdateSubscriptionPackageRequest } from '@/types';

export class SubscriptionPackageModel {
  // Create a new subscription package
  static async create(data: CreateSubscriptionPackageRequest): Promise<SubscriptionPackage> {
    // Check for duplicate package with same combination
    const duplicateCheckQuery = `
      SELECT id FROM subscription_packages
      WHERE max_students = $1
        AND price = $2
        AND duration_days = $3
        AND is_free = $4
        AND deleted_at IS NULL
    `;

    const duplicateCheck = await pool.query(duplicateCheckQuery, [
      data.maxStudents,
      data.price,
      data.durationDays,
      data.isFree || false
    ]);

    if (duplicateCheck.rows.length > 0) {
      throw new Error('Package with same specifications already exists');
    }

    const query = `
      INSERT INTO subscription_packages (
        name, description, max_students, price, duration_days, is_free
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;

    const values = [
      data.name,
      data.description || null,
      data.maxStudents,
      data.price,
      data.durationDays,
      data.isFree || false
    ];

    const result = await pool.query(query, values);
    return this.mapDatabaseToSubscriptionPackage(result.rows[0]);
  }

  // Find subscription package by ID
  static async findById(id: string): Promise<SubscriptionPackage | null> {
    const query = 'SELECT * FROM subscription_packages WHERE id = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDatabaseToSubscriptionPackage(result.rows[0]);
  }

  // Find subscription package by name
  static async findByName(name: string): Promise<SubscriptionPackage | null> {
    const query = 'SELECT * FROM subscription_packages WHERE name = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [name]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDatabaseToSubscriptionPackage(result.rows[0]);
  }

  // Find subscription package by specifications
  static async findBySpecifications(specs: {
    maxStudents: number;
    price: number;
    durationDays: number;
    isFree: boolean;
  }): Promise<SubscriptionPackage | null> {
    const query = `
      SELECT * FROM subscription_packages
      WHERE max_students = $1
        AND price = $2
        AND duration_days = $3
        AND is_free = $4
        AND deleted_at IS NULL
      LIMIT 1
    `;

    const result = await pool.query(query, [
      specs.maxStudents,
      specs.price,
      specs.durationDays,
      specs.isFree
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDatabaseToSubscriptionPackage(result.rows[0]);
  }

  // Get all subscription packages with pagination and filters
  static async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
    isFree?: boolean;
    sortBy?: { key: string; order: 'asc' | 'desc' };
    deleted?: boolean;
  }): Promise<{ packages: SubscriptionPackage[]; total: number; totalPages: number }> {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const offset = (page - 1) * limit;

    let whereClause = params.deleted ? 'WHERE deleted_at IS NOT NULL' : 'WHERE deleted_at IS NULL';
    let searchClause = '';
    let filterClause = '';
    let searchValues: any[] = [];
    let paramCount = 1;

    if (params.search) {
      searchClause = `AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      searchValues.push(`%${params.search}%`);
      paramCount++;
    }

    if (params.isActive !== undefined) {
      filterClause += ` AND is_active = $${paramCount}`;
      searchValues.push(params.isActive);
      paramCount++;
    }

    if (params.isFree !== undefined) {
      filterClause += ` AND is_free = $${paramCount}`;
      searchValues.push(params.isFree);
      paramCount++;
    }

    const sortKey = params.sortBy?.key || 'created_at';
    const sortOrder = params.sortBy?.order || 'desc';

    const countQuery = `
      SELECT COUNT(*) FROM subscription_packages
      ${whereClause}
      ${searchClause}
      ${filterClause}
    `;

    const dataQuery = `
      SELECT * FROM subscription_packages
      ${whereClause}
      ${searchClause}
      ${filterClause}
      ORDER BY ${sortKey} ${sortOrder.toUpperCase()}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    const countResult = await pool.query(countQuery, searchValues);
    const total = parseInt(countResult.rows[0].count);

    const dataResult = await pool.query(dataQuery, [...searchValues, limit, offset]);
    const packages = dataResult.rows.map((row: any) => this.mapDatabaseToSubscriptionPackage(row));

    return {
      packages,
      total,
      totalPages: Math.ceil(total / limit)
    };
  }

  // Update subscription package
  static async update(id: string, updateData: UpdateSubscriptionPackageRequest): Promise<SubscriptionPackage | null> {
    const allowedFields = ['name', 'description', 'max_students', 'price', 'duration_days', 'is_free', 'is_active'];
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key) && value !== undefined) {
        const dbField = key === 'maxStudents' ? 'max_students' :
          key === 'durationDays' ? 'duration_days' :
            key === 'isFree' ? 'is_free' :
              key === 'isActive' ? 'is_active' : key;

        updates.push(`${dbField} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (updates.length === 0) {
      return null;
    }

    updates.push(`updated_at = $${paramCount}`);
    values.push(new Date());
    paramCount++;
    values.push(id);

    const query = `
      UPDATE subscription_packages
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDatabaseToSubscriptionPackage(result.rows[0]);
  }

  // Activate subscription package
  static async activate(id: string): Promise<boolean> {
    const query = `
      UPDATE subscription_packages
      SET is_active = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await pool.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  // Deactivate subscription package
  static async deactivate(id: string): Promise<boolean> {
    const query = `
      UPDATE subscription_packages
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await pool.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  // Soft delete subscription package
  static async delete(id: string): Promise<boolean> {
    const query = `
      UPDATE subscription_packages
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await pool.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  // Get active subscription packages
  static async getActivePackages(): Promise<SubscriptionPackage[]> {
    const query = `
      SELECT * FROM subscription_packages
      WHERE is_active = true AND deleted_at IS NULL
      ORDER BY price ASC, max_students ASC
    `;

    const result = await pool.query(query);
    return result.rows.map((row: any) => this.mapDatabaseToSubscriptionPackage(row));
  }

  // Get free subscription package
  static async getFreePackage(): Promise<SubscriptionPackage | null> {
    const query = `
      SELECT * FROM subscription_packages
      WHERE is_free = true AND is_active = true AND deleted_at IS NULL
      LIMIT 1
    `;

    const result = await pool.query(query);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDatabaseToSubscriptionPackage(result.rows[0]);
  }

  // Map database row to SubscriptionPackage interface
  private static mapDatabaseToSubscriptionPackage(dbPackage: any): SubscriptionPackage {
    return {
      id: dbPackage.id,
      name: dbPackage.name,
      description: dbPackage.description,
      maxStudents: dbPackage.max_students,
      price: parseFloat(dbPackage.price),
      durationDays: dbPackage.duration_days,
      isFree: dbPackage.is_free,
      isActive: dbPackage.is_active,
      createdAt: dbPackage.created_at,
      updatedAt: dbPackage.updated_at
    };
  }
}
