import type { PoolClient } from 'pg';

import pool from '../config/database';

export class TeacherCommissionFreeStudentModel {
  /**
   * Claim one of the teacher's first 20 unique-student positions.
   * The advisory transaction lock serializes concurrent confirmations for the
   * same teacher, while both unique constraints make retries idempotent.
   */
  static async claimIfEligible(
    client: PoolClient,
    args: {
      teacherId: string;
      studentId: string;
      bookingId?: string | null;
    },
  ): Promise<boolean> {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      [`teacher-free-students:${args.teacherId}`],
    );

    const existing = await client.query(
      `SELECT 1
         FROM teacher_commission_free_students
        WHERE teacher_id = $1 AND student_id = $2`,
      [args.teacherId, args.studentId],
    );
    if (existing.rowCount) return true;

    const count = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM teacher_commission_free_students
        WHERE teacher_id = $1`,
      [args.teacherId],
    );
    const nextOrdinal = Number(count.rows[0]?.count ?? 0) + 1;
    if (nextOrdinal > 20) return false;

    const inserted = await client.query(
      `INSERT INTO teacher_commission_free_students (
         teacher_id, student_id, first_booking_id, free_ordinal
       ) VALUES ($1, $2, $3, $4)
       ON CONFLICT (teacher_id, student_id) DO NOTHING
       RETURNING id`,
      [
        args.teacherId,
        args.studentId,
        args.bookingId ?? null,
        nextOrdinal,
      ],
    );
    if (inserted.rowCount) return true;

    const raced = await client.query(
      `SELECT 1
         FROM teacher_commission_free_students
        WHERE teacher_id = $1 AND student_id = $2`,
      [args.teacherId, args.studentId],
    );
    return Boolean(raced.rowCount);
  }

  static async isEligible(
    teacherId: string,
    studentId: string,
  ): Promise<boolean> {
    const result = await pool.query(
      `SELECT 1
         FROM teacher_commission_free_students
        WHERE teacher_id = $1 AND student_id = $2`,
      [teacherId, studentId],
    );
    return Boolean(result.rowCount);
  }

  static async countForTeacher(teacherId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM teacher_commission_free_students
        WHERE teacher_id = $1`,
      [teacherId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}
