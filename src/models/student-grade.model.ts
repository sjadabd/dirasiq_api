import pool from '@/config/database';
import { CreateStudentGradeRequest, StudentGrade, UpdateStudentGradeRequest } from '@/types';

export class StudentGradeModel {
  // Create a new student grade
  static async create(data: CreateStudentGradeRequest): Promise<StudentGrade> {
    const query = `
      INSERT INTO student_grades (student_id, grade_id, study_year)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const values = [data.studentId, data.gradeId, data.studyYear];
    const result = await pool.query(query, values);

    return this.mapDatabaseStudentGradeToStudentGrade(result.rows[0]);
  }

  // Find student grade by ID
  static async findById(id: string): Promise<StudentGrade | null> {
    const query = 'SELECT * FROM student_grades WHERE id = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDatabaseStudentGradeToStudentGrade(result.rows[0]);
  }

  // Find student grades by student ID
  static async findByStudentId(studentId: string): Promise<StudentGrade[]> {
    const query = 'SELECT * FROM student_grades WHERE student_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC';
    const result = await pool.query(query, [studentId]);

    return result.rows.map((row: any) => this.mapDatabaseStudentGradeToStudentGrade(row));
  }

  // Find active student grades by student ID
  static async findActiveByStudentId(studentId: string): Promise<StudentGrade[]> {
    const query = 'SELECT * FROM student_grades WHERE student_id = $1 AND is_active = true AND deleted_at IS NULL ORDER BY created_at DESC';
    const result = await pool.query(query, [studentId]);

    return result.rows.map((row: any) => this.mapDatabaseStudentGradeToStudentGrade(row));
  }

  // Update student grade
  static async update(id: string, updateData: UpdateStudentGradeRequest): Promise<StudentGrade | null> {
    const allowedFields = ['grade_id', 'study_year', 'is_active'];
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

    if (updates.length === 0) {
      return null;
    }

    updates.push(`updated_at = $${paramCount}`);
    values.push(new Date());
    values.push(id);

    const query = `
      UPDATE student_grades
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDatabaseStudentGradeToStudentGrade(result.rows[0]);
  }

  // Soft delete student grade
  static async delete(id: string): Promise<boolean> {
    const query = `
      UPDATE student_grades
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await pool.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  // Get all student grades with pagination
  static async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: { key: string; order: 'asc' | 'desc' };
    deleted?: boolean;
  }): Promise<{ studentGrades: StudentGrade[]; total: number; totalPages: number }> {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const offset = (page - 1) * limit;

    let whereClause = params.deleted ? 'WHERE deleted_at IS NOT NULL' : 'WHERE deleted_at IS NULL';
    let searchClause = '';
    let searchValues: any[] = [];

    if (params.search) {
      searchClause = `AND (study_year ILIKE $1)`;
      searchValues.push(`%${params.search}%`);
    }

    const sortKey = params.sortBy?.key || 'created_at';
    const sortOrder = params.sortBy?.order || 'desc';

    const countQuery = `
      SELECT COUNT(*) FROM student_grades
      ${whereClause}
      ${searchClause}
    `;

    const dataQuery = `
      SELECT * FROM student_grades
      ${whereClause}
      ${searchClause}
      ORDER BY ${sortKey} ${sortOrder.toUpperCase()}
      LIMIT $${searchValues.length + 1} OFFSET $${searchValues.length + 2}
    `;

    const countResult = await pool.query(countQuery, searchValues);
    const total = parseInt(countResult.rows[0].count);

    const dataResult = await pool.query(dataQuery, [...searchValues, limit, offset]);
    const studentGrades = dataResult.rows.map((row: any) => this.mapDatabaseStudentGradeToStudentGrade(row));

    return {
      studentGrades,
      total,
      totalPages: Math.ceil(total / limit)
    };
  }

  // Map database student grade to StudentGrade interface
  private static mapDatabaseStudentGradeToStudentGrade(dbStudentGrade: any): StudentGrade {
    return {
      id: dbStudentGrade.id,
      studentId: dbStudentGrade.student_id,
      gradeId: dbStudentGrade.grade_id,
      studyYear: dbStudentGrade.study_year,
      isActive: dbStudentGrade.is_active,
      createdAt: dbStudentGrade.created_at,
      updatedAt: dbStudentGrade.updated_at,
    };
  }
}
