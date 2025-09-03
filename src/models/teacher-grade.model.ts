import pool from '@/config/database';
import { CreateTeacherGradeRequest, TeacherGrade, UpdateTeacherGradeRequest } from '@/types';

export class TeacherGradeModel {
  // Create a new teacher grade
  static async create(data: CreateTeacherGradeRequest): Promise<TeacherGrade> {
    const query = `
      INSERT INTO teacher_grades (teacher_id, grade_id, study_year)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const values = [data.teacherId, data.gradeId, data.studyYear];
    const result = await pool.query(query, values);

    return this.mapDatabaseTeacherGradeToTeacherGrade(result.rows[0]);
  }

  // Create multiple teacher grades
  static async createMany(teacherId: string, gradeIds: string[], studyYear: string): Promise<TeacherGrade[]> {
    const teacherGrades: TeacherGrade[] = [];

    for (const gradeId of gradeIds) {
      try {
        const teacherGrade = await this.create({
          teacherId,
          gradeId,
          studyYear
        });
        teacherGrades.push(teacherGrade);
      } catch (error) {
        console.error(`Error creating teacher grade for grade ${gradeId}:`, error);
        // Continue with other grades even if one fails
      }
    }

    return teacherGrades;
  }

  // Find teacher grade by ID
  static async findById(id: string): Promise<TeacherGrade | null> {
    const query = 'SELECT * FROM teacher_grades WHERE id = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDatabaseTeacherGradeToTeacherGrade(result.rows[0]);
  }

  // Find teacher grades by teacher ID
  static async findByTeacherId(teacherId: string): Promise<TeacherGrade[]> {
    const query = 'SELECT * FROM teacher_grades WHERE teacher_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC';
    const result = await pool.query(query, [teacherId]);

    return result.rows.map((row: any) => this.mapDatabaseTeacherGradeToTeacherGrade(row));
  }

  // Find active teacher grades by teacher ID
  static async findActiveByTeacherId(teacherId: string): Promise<TeacherGrade[]> {
    const query = 'SELECT * FROM teacher_grades WHERE teacher_id = $1 AND is_active = true AND deleted_at IS NULL ORDER BY created_at DESC';
    const result = await pool.query(query, [teacherId]);

    return result.rows.map((row: any) => this.mapDatabaseTeacherGradeToTeacherGrade(row));
  }

  // Update teacher grade
  static async update(id: string, updateData: UpdateTeacherGradeRequest): Promise<TeacherGrade | null> {
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
      UPDATE teacher_grades
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDatabaseTeacherGradeToTeacherGrade(result.rows[0]);
  }

  // Soft delete teacher grade
  static async delete(id: string): Promise<boolean> {
    const query = `
      UPDATE teacher_grades
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await pool.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  // Get all teacher grades with pagination
  static async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: { key: string; order: 'asc' | 'desc' };
    deleted?: boolean;
  }): Promise<{ teacherGrades: TeacherGrade[]; total: number; totalPages: number }> {
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
      SELECT COUNT(*) FROM teacher_grades
      ${whereClause}
      ${searchClause}
    `;

    const dataQuery = `
      SELECT * FROM teacher_grades
      ${whereClause}
      ${searchClause}
      ORDER BY ${sortKey} ${sortOrder.toUpperCase()}
      LIMIT $${searchValues.length + 1} OFFSET $${searchValues.length + 2}
    `;

    const countResult = await pool.query(countQuery, searchValues);
    const total = parseInt(countResult.rows[0].count);

    const dataResult = await pool.query(dataQuery, [...searchValues, limit, offset]);
    const teacherGrades = dataResult.rows.map((row: any) => this.mapDatabaseTeacherGradeToTeacherGrade(row));

    return {
      teacherGrades,
      total,
      totalPages: Math.ceil(total / limit)
    };
  }

  // Map database teacher grade to TeacherGrade interface
  private static mapDatabaseTeacherGradeToTeacherGrade(dbTeacherGrade: any): TeacherGrade {
    return {
      id: dbTeacherGrade.id,
      teacherId: dbTeacherGrade.teacher_id,
      gradeId: dbTeacherGrade.grade_id,
      studyYear: dbTeacherGrade.study_year,
      isActive: dbTeacherGrade.is_active,
      createdAt: dbTeacherGrade.created_at,
      updatedAt: dbTeacherGrade.updated_at,
    };
  }
}
