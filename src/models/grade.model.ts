import pool from '@/config/database';
import { CreateGradeRequest, Grade, UpdateGradeRequest } from '@/types';

export class GradeModel {
  // Create new grade
  static async create(teacherId: string, data: CreateGradeRequest): Promise<Grade> {
    const query = `
      INSERT INTO grades (teacher_id, name, description)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const values = [teacherId, data.name, data.description];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Get grade by ID
  static async findById(id: string): Promise<Grade | null> {
    const query = 'SELECT * FROM grades WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  // Get grade by ID and teacher ID (for authorization)
  static async findByIdAndTeacher(id: string, teacherId: string): Promise<Grade | null> {
    const query = 'SELECT * FROM grades WHERE id = $1 AND teacher_id = $2';
    const result = await pool.query(query, [id, teacherId]);
    return result.rows[0] || null;
  }

  // Get all grades for a teacher with pagination
  static async findAllByTeacher(teacherId: string, page: number = 1, limit: number = 10, search?: string): Promise<{ grades: Grade[], total: number }> {
    let query = 'SELECT * FROM grades WHERE teacher_id = $1';
    let countQuery = 'SELECT COUNT(*) FROM grades WHERE teacher_id = $1';
    const params: any[] = [teacherId];
    let paramIndex = 2;
    let whereConditions: string[] = [];

    // Add search condition if provided and not empty/null
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
      pool.query(countQuery, whereConditions.length > 0 ? [teacherId, ...params.slice(1, whereConditions.length + 1)] : [teacherId])
    ]);

    return {
      grades: result.rows,
      total: parseInt(countResult.rows[0].count)
    };
  }

  // Update grade
  static async update(id: string, teacherId: string, data: UpdateGradeRequest): Promise<Grade | null> {
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

    if (fields.length === 0) {
      return this.findByIdAndTeacher(id, teacherId);
    }

    values.push(id, teacherId);
    const query = `
      UPDATE grades
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex} AND teacher_id = $${paramIndex + 1}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  // Delete grade
  static async delete(id: string, teacherId: string): Promise<boolean> {
    const query = 'DELETE FROM grades WHERE id = $1 AND teacher_id = $2';
    const result = await pool.query(query, [id, teacherId]);
    return (result.rowCount || 0) > 0;
  }

  // Check if grade exists
  static async exists(id: string): Promise<boolean> {
    const query = 'SELECT EXISTS(SELECT 1 FROM grades WHERE id = $1)';
    const result = await pool.query(query, [id]);
    return result.rows[0].exists;
  }

  // Check if grade name already exists for the same teacher
  static async nameExistsForTeacher(teacherId: string, name: string, excludeId?: string): Promise<boolean> {
    let query: string;
    const params: any[] = [teacherId, name];

    if (excludeId) {
      query = 'SELECT EXISTS(SELECT 1 FROM grades WHERE teacher_id = $1 AND name = $2 AND id != $3)';
      params.push(excludeId);
    } else {
      query = 'SELECT EXISTS(SELECT 1 FROM grades WHERE teacher_id = $1 AND name = $2)';
    }

    const result = await pool.query(query, params);
    return result.rows[0].exists;
  }
}
