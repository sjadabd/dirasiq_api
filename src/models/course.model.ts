import pool from '@/config/database';
import { Course, CreateCourseRequest, UpdateCourseRequest } from '@/types';

export class CourseModel {
  // Create new course
  static async create(teacherId: string, data: CreateCourseRequest): Promise<Course> {
    const query = `
      INSERT INTO courses (
        teacher_id, study_year, grade_id, subject_id, course_name,
        course_images, description, start_date, end_date, price, seats_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    const values = [
      teacherId,
      data.study_year,
      data.grade_id,
      data.subject_id,
      data.course_name,
      data.course_images || [],
      data.description,
      data.start_date,
      data.end_date,
      data.price,
      data.seats_count
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Get course by ID
  static async findById(id: string): Promise<Course | null> {
    const query = 'SELECT * FROM courses WHERE id = $1 AND is_deleted = false';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  // Get course by ID and teacher ID (for authorization)
  static async findByIdAndTeacher(id: string, teacherId: string): Promise<Course | null> {
    const query = 'SELECT * FROM courses WHERE id = $1 AND teacher_id = $2 AND is_deleted = false';
    const result = await pool.query(query, [id, teacherId]);
    return result.rows[0] || null;
  }

  // Get all courses for a teacher with pagination and filters
  static async findAllByTeacher(
    teacherId: string,
    page: number = 1,
    limit: number = 10,
    search?: string,
    studyYear?: string,
    gradeId?: string,
    subjectId?: string,
    deleted?: boolean
  ): Promise<{ courses: Course[], total: number }> {
    // Build base query based on deleted parameter
    let baseWhereClause = 'WHERE teacher_id = $1';
    if (deleted === true) {
      baseWhereClause += ' AND is_deleted = true';
    } else if (deleted === false) {
      baseWhereClause += ' AND is_deleted = false';
    }
    // If deleted is undefined, show all courses (both deleted and non-deleted)

    let query = `SELECT * FROM courses ${baseWhereClause}`;
    let countQuery = `SELECT COUNT(*) FROM courses ${baseWhereClause}`;
    const params: any[] = [teacherId];
    let paramIndex = 2;
    let whereConditions: string[] = [];

    // Add search condition if provided
    if (search && search.trim() !== '' && search !== 'null' && search !== 'undefined') {
      whereConditions.push(`course_name ILIKE $${paramIndex}`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    // Add study year filter
    if (studyYear && studyYear !== 'null' && studyYear !== 'undefined') {
      whereConditions.push(`study_year = $${paramIndex}`);
      params.push(studyYear);
      paramIndex++;
    }

    // Add grade filter
    if (gradeId && gradeId !== 'null' && gradeId !== 'undefined') {
      whereConditions.push(`grade_id = $${paramIndex}`);
      params.push(gradeId);
      paramIndex++;
    }

    // Add subject filter
    if (subjectId && subjectId !== 'null' && subjectId !== 'undefined') {
      whereConditions.push(`subject_id = $${paramIndex}`);
      params.push(subjectId);
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
      courses: result.rows,
      total: parseInt(countResult.rows[0].count)
    };
  }

  // Update course
  static async update(id: string, teacherId: string, data: UpdateCourseRequest): Promise<Course | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.study_year !== undefined) {
      fields.push(`study_year = $${paramIndex}`);
      values.push(data.study_year);
      paramIndex++;
    }

    if (data.grade_id !== undefined) {
      fields.push(`grade_id = $${paramIndex}`);
      values.push(data.grade_id);
      paramIndex++;
    }

    if (data.subject_id !== undefined) {
      fields.push(`subject_id = $${paramIndex}`);
      values.push(data.subject_id);
      paramIndex++;
    }

    if (data.course_name !== undefined) {
      fields.push(`course_name = $${paramIndex}`);
      values.push(data.course_name);
      paramIndex++;
    }

    if (data.course_images !== undefined) {
      fields.push(`course_images = $${paramIndex}`);
      values.push(data.course_images);
      paramIndex++;
    }

    if (data.description !== undefined) {
      fields.push(`description = $${paramIndex}`);
      values.push(data.description);
      paramIndex++;
    }

    if (data.start_date !== undefined) {
      fields.push(`start_date = $${paramIndex}`);
      values.push(data.start_date);
      paramIndex++;
    }

    if (data.end_date !== undefined) {
      fields.push(`end_date = $${paramIndex}`);
      values.push(data.end_date);
      paramIndex++;
    }

    if (data.price !== undefined) {
      fields.push(`price = $${paramIndex}`);
      values.push(data.price);
      paramIndex++;
    }

    if (data.seats_count !== undefined) {
      fields.push(`seats_count = $${paramIndex}`);
      values.push(data.seats_count);
      paramIndex++;
    }

    if (fields.length === 0) {
      return this.findByIdAndTeacher(id, teacherId);
    }

    values.push(id, teacherId);
    const query = `
      UPDATE courses
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex} AND teacher_id = $${paramIndex + 1} AND is_deleted = false
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  // Soft delete course
  static async softDelete(id: string, teacherId: string): Promise<boolean> {
    const query = `
      UPDATE courses
      SET is_deleted = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND teacher_id = $2 AND is_deleted = false
    `;
    const result = await pool.query(query, [id, teacherId]);
    return (result.rowCount || 0) > 0;
  }

  // Check if course exists
  static async exists(id: string): Promise<boolean> {
    const query = 'SELECT EXISTS(SELECT 1 FROM courses WHERE id = $1 AND is_deleted = false)';
    const result = await pool.query(query, [id]);
    return result.rows[0].exists;
  }

  // Check if course name already exists for the same teacher in the same year
  static async nameExistsForTeacher(teacherId: string, studyYear: string, courseName: string, excludeId?: string): Promise<boolean> {
    let query: string;
    const params: any[] = [teacherId, studyYear, courseName];

    if (excludeId) {
      query = 'SELECT EXISTS(SELECT 1 FROM courses WHERE teacher_id = $1 AND study_year = $2 AND course_name = $3 AND id != $4 AND is_deleted = false)';
      params.push(excludeId);
    } else {
      query = 'SELECT EXISTS(SELECT 1 FROM courses WHERE teacher_id = $1 AND study_year = $2 AND course_name = $3 AND is_deleted = false)';
    }

    const result = await pool.query(query, params);
    return result.rows[0].exists;
  }

  // Get course with related data (grade and subject names)
  static async findByIdWithRelations(id: string, teacherId: string): Promise<any> {
    const query = `
      SELECT
        c.*,
        g.name as grade_name,
        s.name as subject_name
      FROM courses c
      LEFT JOIN grades g ON c.grade_id = g.id
      LEFT JOIN subjects s ON c.subject_id = s.id
      WHERE c.id = $1 AND c.teacher_id = $2 AND c.is_deleted = false
    `;
    const result = await pool.query(query, [id, teacherId]);
    return result.rows[0] || null;
  }

  // Find courses by grades and location for students
  static async findByGradesAndLocation(
    gradeIds: string[],
    studentLocation: { latitude: number; longitude: number },
    maxDistance: number = 5,
    limit: number = 10,
    offset: number = 0
  ): Promise<Course[]> {
    const query = `
      SELECT 
        c.*,
        u.name as teacher_name,
        u.phone as teacher_phone,
        u.address as teacher_address,
        u.bio as teacher_bio,
        u.experience_years as teacher_experience_years,
        u.latitude as teacher_latitude,
        u.longitude as teacher_longitude,
        g.name as grade_name,
        s.name as subject_name,
        (
          6371 * acos(
            cos(radians($1)) * cos(radians(u.latitude)) * 
            cos(radians(u.longitude) - radians($2)) + 
            sin(radians($1)) * sin(radians(u.latitude))
          )
        ) as distance
      FROM courses c
      INNER JOIN users u ON c.teacher_id = u.id
      INNER JOIN grades g ON c.grade_id = g.id
      INNER JOIN subjects s ON c.subject_id = s.id
      WHERE c.grade_id = ANY($3)
        AND c.is_deleted = false
        AND u.user_type = 'teacher'
        AND u.status = 'active'
        AND u.latitude IS NOT NULL
        AND u.longitude IS NOT NULL
        AND (
          6371 * acos(
            cos(radians($1)) * cos(radians(u.latitude)) * 
            cos(radians(u.longitude) - radians($2)) + 
            sin(radians($1)) * sin(radians(u.latitude))
          )
        ) <= $4
      ORDER BY distance ASC, c.created_at DESC
      LIMIT $5 OFFSET $6
    `;

    const values = [
      studentLocation.latitude,
      studentLocation.longitude,
      gradeIds,
      maxDistance,
      limit,
      offset
    ];

    const result = await pool.query(query, values);
    return result.rows;
  }
}
