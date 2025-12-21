import pool from '../config/database';

export class TeacherStudentCapacityModel {
  static async ensure(teacherId: string): Promise<void> {
    await pool.query(
      `INSERT INTO teacher_student_capacity (teacher_id, current_students)
       VALUES ($1, 0)
       ON CONFLICT (teacher_id) DO NOTHING`,
      [teacherId]
    );
  }

  static async getCurrentStudents(teacherId: string): Promise<number> {
    await this.ensure(teacherId);
    const r = await pool.query(
      `SELECT current_students
       FROM teacher_student_capacity
       WHERE teacher_id = $1`,
      [teacherId]
    );
    return Number(r.rows[0]?.current_students || 0);
  }

  static async increment(teacherId: string, client?: any): Promise<void> {
    const q = `
      INSERT INTO teacher_student_capacity (teacher_id, current_students)
      VALUES ($1, 1)
      ON CONFLICT (teacher_id) DO UPDATE
      SET current_students = teacher_student_capacity.current_students + 1,
          updated_at = CURRENT_TIMESTAMP
    `;
    if (client) {
      await client.query(q, [teacherId]);
      return;
    }
    await pool.query(q, [teacherId]);
  }

  static async decrement(teacherId: string, client?: any): Promise<void> {
    const q = `
      INSERT INTO teacher_student_capacity (teacher_id, current_students)
      VALUES ($1, 0)
      ON CONFLICT (teacher_id) DO UPDATE
      SET current_students = GREATEST(teacher_student_capacity.current_students - 1, 0),
          updated_at = CURRENT_TIMESTAMP
    `;
    if (client) {
      await client.query(q, [teacherId]);
      return;
    }
    await pool.query(q, [teacherId]);
  }

  static async recalculateFromBookings(
    teacherId: string,
    client?: any
  ): Promise<number> {
    const q = `
      WITH cnt AS (
        SELECT COUNT(*)::int AS c
        FROM course_bookings cb
        WHERE cb.teacher_id = $1
          AND cb.status = 'confirmed'
          AND cb.is_deleted = false
      )
      INSERT INTO teacher_student_capacity (teacher_id, current_students)
      SELECT $1, c FROM cnt
      ON CONFLICT (teacher_id) DO UPDATE
      SET current_students = EXCLUDED.current_students,
          updated_at = CURRENT_TIMESTAMP
      RETURNING current_students
    `;
    const r = client
      ? await client.query(q, [teacherId])
      : await pool.query(q, [teacherId]);
    return Number(r.rows[0]?.current_students || 0);
  }
}
