import pool from '@/config/database';
import { CreateSubjectRequest, Subject, UpdateSubjectRequest } from '@/types';

export class SubjectModel {
  // Create new subject
  static async create(teacherId: string, data: CreateSubjectRequest): Promise<Subject> {
    const query = `
      INSERT INTO subjects (teacher_id, name, description)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const values = [teacherId, data.name, data.description];
    const result = await pool.query(query, values);
    return this.mapDatabaseSubjectToSubject(result.rows[0]);
  }

  // Get subject by ID
  static async findById(id: string, includeDeleted: boolean = false): Promise<Subject | null> {
    let query = 'SELECT * FROM subjects WHERE id = $1';
    if (!includeDeleted) {
      query += ' AND deleted_at IS NULL';
    }
    const result = await pool.query(query, [id]);
    return result.rows[0] ? this.mapDatabaseSubjectToSubject(result.rows[0]) : null;
  }

  // Get subject by ID and teacher ID (for authorization)
  static async findByIdAndTeacher(id: string, teacherId: string, includeDeleted: boolean = false): Promise<Subject | null> {
    let query = 'SELECT * FROM subjects WHERE id = $1 AND teacher_id = $2';
    if (!includeDeleted) {
      query += ' AND deleted_at IS NULL';
    }
    const result = await pool.query(query, [id, teacherId]);
    return result.rows[0] ? this.mapDatabaseSubjectToSubject(result.rows[0]) : null;
  }

  // Get all subjects for a teacher with pagination
  static async findAllByTeacher(
    teacherId: string,
    page: number = 1,
    limit: number = 10,
    search?: string,
    includeDeleted: boolean | null = false
  ): Promise<{ subjects: Subject[], total: number }> {
    let query = 'SELECT * FROM subjects WHERE teacher_id = $1';
    let countQuery = 'SELECT COUNT(*) FROM subjects WHERE teacher_id = $1';
    const params: any[] = [teacherId];
    let paramIndex = 2;
    let whereConditions: string[] = [];

    // Add deleted condition based on includeDeleted value
    if (includeDeleted === false) {
      // Only active subjects (deleted_at IS NULL)
      whereConditions.push('deleted_at IS NULL');
    } else if (includeDeleted === true) {
      // Only deleted subjects (deleted_at IS NOT NULL)
      whereConditions.push('deleted_at IS NOT NULL');
    }
    // If includeDeleted is null, no condition is added (all subjects)

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
      pool.query(countQuery, whereConditions.length > 0 ? [teacherId, ...params.slice(1, -2)] : [teacherId])
    ]);

    return {
      subjects: result.rows.map((row: any) => this.mapDatabaseSubjectToSubject(row)),
      total: parseInt(countResult.rows[0].count)
    };
  }

  // Update subject
  static async update(id: string, teacherId: string, data: UpdateSubjectRequest): Promise<Subject | null> {
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
      UPDATE subjects
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex} AND teacher_id = $${paramIndex + 1}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0] ? this.mapDatabaseSubjectToSubject(result.rows[0]) : null;
  }

  // Soft delete subject
  static async delete(id: string, teacherId: string): Promise<boolean> {
    const query = `
      UPDATE subjects
      SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL
    `;
    const result = await pool.query(query, [id, teacherId]);
    return (result.rowCount || 0) > 0;
  }

  // Restore soft deleted subject
  static async restore(id: string, teacherId: string): Promise<boolean> {
    const query = `
      UPDATE subjects
      SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NOT NULL
    `;
    const result = await pool.query(query, [id, teacherId]);
    return (result.rowCount || 0) > 0;
  }

  // Hard delete subject (permanent deletion)
  static async hardDelete(id: string, teacherId: string): Promise<boolean> {
    const query = 'DELETE FROM subjects WHERE id = $1 AND teacher_id = $2';
    const result = await pool.query(query, [id, teacherId]);
    return (result.rowCount || 0) > 0;
  }

  // Check if subject exists
  static async exists(id: string, includeDeleted: boolean = false): Promise<boolean> {
    let query = 'SELECT EXISTS(SELECT 1 FROM subjects WHERE id = $1)';
    if (!includeDeleted) {
      query += ' AND deleted_at IS NULL';
    }
    const result = await pool.query(query, [id]);
    return result.rows[0].exists;
  }

  // Check if subject name already exists for the same teacher
  static async nameExistsForTeacher(teacherId: string, name: string, excludeId?: string): Promise<boolean> {
    let query: string;
    const params: any[] = [teacherId, name];

    if (excludeId) {
      query = 'SELECT EXISTS(SELECT 1 FROM subjects WHERE teacher_id = $1 AND name = $2 AND id != $3 AND deleted_at IS NULL)';
      params.push(excludeId);
    } else {
      query = 'SELECT EXISTS(SELECT 1 FROM subjects WHERE teacher_id = $1 AND name = $2 AND deleted_at IS NULL)';
    }

    const result = await pool.query(query, params);
    return result.rows[0].exists;
  }

  // Map database subject to Subject interface with is_deleted field
  private static mapDatabaseSubjectToSubject(dbSubject: any): Subject {
    return {
      id: dbSubject.id,
      teacher_id: dbSubject.teacher_id,
      name: dbSubject.name,
      description: dbSubject.description,
      created_at: dbSubject.created_at,
      updated_at: dbSubject.updated_at,
      deleted_at: dbSubject.deleted_at,
      is_deleted: dbSubject.deleted_at !== null
    };
  }
}
