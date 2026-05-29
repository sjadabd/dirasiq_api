// CRUD for video_course_free_students (whitelist of students who get free
// access to a paid video course).

import pool from '../config/database';

export interface VideoCourseFreeStudentRow {
  video_course_id: string;
  student_id: string;
  granted_at: Date;
  granted_by: string | null;
  reason: string | null;
}

export interface WhitelistedStudent {
  studentId: string;
  studentName: string;
  grantedAt: Date;
  grantedBy: string | null;
  reason: string | null;
}

export class VideoCourseFreeStudentModel {
  /**
   * Replace-set sync. The `grantedBy` + `reason` apply to every newly-
   * inserted row; existing rows keep their original audit metadata
   * unchanged (we do NOT overwrite on conflict — preserves who granted
   * each row when).
   */
  static async sync(
    videoCourseId: string,
    studentIds: string[],
    grantedBy: string | null,
    reason: string | null,
    client?: any
  ): Promise<void> {
    const db = client || pool;
    const dedup = Array.from(new Set(studentIds));

    await db.query(
      `DELETE FROM video_course_free_students
        WHERE video_course_id = $1
          AND NOT (student_id = ANY($2::uuid[]))`,
      [videoCourseId, dedup]
    );

    if (dedup.length === 0) return;

    await db.query(
      `INSERT INTO video_course_free_students (video_course_id, student_id, granted_by, reason)
       SELECT $1, student_id, $3, $4
         FROM UNNEST($2::uuid[]) AS student_id
       ON CONFLICT (video_course_id, student_id) DO NOTHING`,
      [videoCourseId, dedup, grantedBy, reason]
    );
  }

  /**
   * Whitelist for a video course with student names + audit metadata.
   * Used by the teacher edit form and the admin moderation panel.
   */
  static async listForVideoCourse(
    videoCourseId: string
  ): Promise<WhitelistedStudent[]> {
    const { rows } = await pool.query<{
      student_id: string;
      name: string;
      granted_at: Date;
      granted_by: string | null;
      reason: string | null;
    }>(
      `SELECT vcfs.student_id,
              u.name,
              vcfs.granted_at,
              vcfs.granted_by,
              vcfs.reason
         FROM video_course_free_students vcfs
         JOIN users u ON u.id = vcfs.student_id
        WHERE vcfs.video_course_id = $1
        ORDER BY vcfs.granted_at DESC`,
      [videoCourseId]
    );
    return rows.map((r) => ({
      studentId: r.student_id,
      studentName: r.name,
      grantedAt: r.granted_at,
      grantedBy: r.granted_by,
      reason: r.reason,
    }));
  }

  /**
   * Single-row presence check. Tiny convenience over the DB function
   * for callers that only need to verify whitelist (not full access).
   */
  static async isWhitelisted(
    videoCourseId: string,
    studentId: string
  ): Promise<boolean> {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM video_course_free_students
          WHERE video_course_id = $1
            AND student_id = $2
       ) AS exists`,
      [videoCourseId, studentId]
    );
    return rows[0]?.exists ?? false;
  }
}
