import pool from '../config/database';
import { AcademicYear, CreateAcademicYearRequest, UpdateAcademicYearRequest } from '../types';

export class AcademicYearModel {
  // Create new academic year
  static async create(data: CreateAcademicYearRequest): Promise<AcademicYear> {
    const query = `
      INSERT INTO academic_years (year)
      VALUES ($1)
      RETURNING *
    `;

    const result = await pool.query(query, [data.year]);
    return result.rows[0];
  }

  // Find academic year by ID
  static async findById(id: string): Promise<AcademicYear | null> {
    const query = 'SELECT * FROM academic_years WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  // Find academic year by year
  static async findByYear(year: string): Promise<AcademicYear | null> {
    const query = 'SELECT * FROM academic_years WHERE year = $1';
    const result = await pool.query(query, [year]);
    return result.rows[0] || null;
  }

  // Get all academic years with pagination
  static async findAll(page: number = 1, limit: number = 10, search?: string, isActive?: boolean): Promise<{ academicYears: AcademicYear[], total: number }> {
    let query = 'SELECT * FROM academic_years';
    let countQuery = 'SELECT COUNT(*) FROM academic_years';
    const params: any[] = [];
    let paramIndex = 1;
    let whereConditions: string[] = [];

    // Add search condition if provided and not empty/null
    if (search && search.trim() !== '' && search !== 'null' && search !== 'undefined') {
      whereConditions.push(`year ILIKE $${paramIndex}`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    // Add is_active condition if provided
    if (isActive !== undefined) {
      whereConditions.push(`is_active = $${paramIndex}`);
      params.push(isActive);
      paramIndex++;
    }

    // Combine conditions
    if (whereConditions.length > 0) {
      const whereClause = ' WHERE ' + whereConditions.join(' AND ');
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
      academicYears: result.rows,
      total: parseInt(countResult.rows[0].count)
    };
  }

  // Get active academic year
  static async getActive(): Promise<AcademicYear | null> {
    const query = 'SELECT * FROM academic_years WHERE is_active = true LIMIT 1';
    const result = await pool.query(query);
    return result.rows[0] || null;
  }

  // Update academic year
  static async update(id: string, data: UpdateAcademicYearRequest): Promise<AcademicYear | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.year !== undefined) {
      fields.push(`year = $${paramIndex}`);
      values.push(data.year);
      paramIndex++;
    }

    if (data.is_active !== undefined) {
      fields.push(`is_active = $${paramIndex}`);
      values.push(data.is_active);
      paramIndex++;
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE academic_years
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  // Delete academic year
  static async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM academic_years WHERE id = $1';
    const result = await pool.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  // Check if academic year exists
  static async exists(id: string): Promise<boolean> {
    const query = 'SELECT EXISTS(SELECT 1 FROM academic_years WHERE id = $1)';
    const result = await pool.query(query, [id]);
    return result.rows[0].exists;
  }

  // Check if year already exists
  static async yearExists(year: string, excludeId?: string): Promise<boolean> {
    let query: string;
    const params: any[] = [year];

    if (excludeId) {
      query = 'SELECT EXISTS(SELECT 1 FROM academic_years WHERE year = $1 AND id != $2)';
      params.push(excludeId);
    } else {
      query = 'SELECT EXISTS(SELECT 1 FROM academic_years WHERE year = $1)';
    }

    const result = await pool.query(query, params);
    return result.rows[0].exists;
  }

  // Activate academic year (deactivates all others)
  static async activate(id: string): Promise<AcademicYear | null> {
    // First, deactivate all academic years
    await pool.query('UPDATE academic_years SET is_active = false');

    // Then activate the specified one
    const query = `
      UPDATE academic_years
      SET is_active = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }
}
