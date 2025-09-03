import pool from '@/config/database';
import { CreateGradeRequest, Grade, UpdateGradeRequest } from '@/types';

export class GradeModel {
  // Create new grade (Super Admin only)
  static async create(data: CreateGradeRequest): Promise<Grade> {
    const query = `
      INSERT INTO grades (name, description, is_active)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const values = [data.name, data.description, data.isActive !== false];
    const result = await pool.query(query, values);
    return this.mapDatabaseGradeToGrade(result.rows[0]);
  }

  // Get grade by ID
  static async findById(id: string): Promise<Grade | null> {
    const query = 'SELECT * FROM grades WHERE id = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) return null;
    return this.mapDatabaseGradeToGrade(result.rows[0]);
  }

  // Get all grades with pagination (Super Admin only)
  static async findAll(page: number = 1, limit: number = 10, search?: string): Promise<{ grades: Grade[], total: number }> {
    let query = 'SELECT * FROM grades WHERE deleted_at IS NULL';
    let countQuery = 'SELECT COUNT(*) FROM grades WHERE deleted_at IS NULL';
    const params: any[] = [];
    let paramIndex = 1;
    let whereConditions: string[] = [];

    // Add search condition if provided
    if (search && search.trim() !== '' && search !== 'null' && search !== 'undefined') {
      whereConditions.push(`name ILIKE $${paramIndex}`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    // Combine conditions
    if (whereConditions.length > 0) {
      const whereClause = ' AND ' + whereConditions.join(' AND ');
      query += whereClause;
      countQuery += whereClause;
    }

    // Add ordering
    query += ' ORDER BY created_at DESC';

    // Add pagination
    const offset = (page - 1) * limit;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    // Execute queries
    const [result, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, whereConditions.length > 0 ? params.slice(0, whereConditions.length) : [])
    ]);

    return {
      grades: result.rows.map(row => this.mapDatabaseGradeToGrade(row)),
      total: parseInt(countResult.rows[0].count)
    };
  }

  // Get active grades only (for public use)
  static async findActive(): Promise<Grade[]> {
    const query = 'SELECT * FROM grades WHERE is_active = true AND deleted_at IS NULL ORDER BY name ASC';
    const result = await pool.query(query);
    return result.rows.map(row => this.mapDatabaseGradeToGrade(row));
  }

  // Update grade (Super Admin only)
  static async update(id: string, data: UpdateGradeRequest): Promise<Grade | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramIndex}`);
      values.push(data.name);
      paramIndex++;
    }

    if (data.description !== undefined) {
      fields.push(`description = $${paramIndex}`);
      values.push(data.description);
      paramIndex++;
    }

    if (data.isActive !== undefined) {
      fields.push(`is_active = $${paramIndex}`);
      values.push(data.isActive);
      paramIndex++;
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE grades
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    if (result.rows.length === 0) return null;
    return this.mapDatabaseGradeToGrade(result.rows[0]);
  }

  // Soft delete grade (Super Admin only)
  static async delete(id: string): Promise<boolean> {
    const query = `
      UPDATE grades
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const result = await pool.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  // Check if grade exists
  static async exists(id: string): Promise<boolean> {
    const query = 'SELECT EXISTS(SELECT 1 FROM grades WHERE id = $1 AND deleted_at IS NULL)';
    const result = await pool.query(query, [id]);
    return result.rows[0].exists;
  }

  // Check if grade name already exists
  static async nameExists(name: string, excludeId?: string): Promise<boolean> {
    let query: string;
    const params: any[] = [name];

    if (excludeId) {
      query = 'SELECT EXISTS(SELECT 1 FROM grades WHERE name = $1 AND id != $2 AND deleted_at IS NULL)';
      params.push(excludeId);
    } else {
      query = 'SELECT EXISTS(SELECT 1 FROM grades WHERE name = $1 AND deleted_at IS NULL)';
    }

    const result = await pool.query(query, params);
    return result.rows[0].exists;
  }

  // Map database grade to Grade interface
  private static mapDatabaseGradeToGrade(dbGrade: any): Grade {
    return {
      id: dbGrade.id,
      name: dbGrade.name,
      description: dbGrade.description,
      isActive: dbGrade.is_active,
      createdAt: dbGrade.created_at,
      updatedAt: dbGrade.updated_at,
    };
  }
}
