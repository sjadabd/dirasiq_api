// CRUD for video_course_target_courses (pivot: video_course → live courses
// for Course Hub display). NOT used for access control — see
// VideoCourseAccessService in Phase 2.

import pool from '../config/database';

export interface VideoCourseTargetCourseRow {
  video_course_id: string;
  course_id: string;
  created_at: Date;
}

export interface LinkedLiveCourse {
  courseId: string;
  courseName: string;
}

export class VideoCourseTargetCourseModel {
  /**
   * Replace-set sync of pinned live courses. Ownership validation lives
   * upstream (Phase 2 service layer) — this model trusts its inputs.
   */
  static async sync(
    videoCourseId: string,
    courseIds: string[],
    client?: any
  ): Promise<void> {
    const db = client || pool;
    const dedup = Array.from(new Set(courseIds));

    await db.query(
      `DELETE FROM video_course_target_courses
        WHERE video_course_id = $1
          AND NOT (course_id = ANY($2::uuid[]))`,
      [videoCourseId, dedup]
    );

    if (dedup.length === 0) return;

    await db.query(
      `INSERT INTO video_course_target_courses (video_course_id, course_id)
       SELECT $1, course_id
         FROM UNNEST($2::uuid[]) AS course_id
       ON CONFLICT (video_course_id, course_id) DO NOTHING`,
      [videoCourseId, dedup]
    );
  }

  /**
   * List the live courses a video course is pinned to. Joined to
   * courses.course_name + filtered to non-deleted courses.
   */
  static async listForVideoCourse(
    videoCourseId: string
  ): Promise<LinkedLiveCourse[]> {
    const { rows } = await pool.query<{ course_id: string; course_name: string }>(
      `SELECT vctc.course_id, c.course_name
         FROM video_course_target_courses vctc
         JOIN courses c ON c.id = vctc.course_id
        WHERE vctc.video_course_id = $1
          AND c.is_deleted = FALSE
        ORDER BY c.course_name ASC`,
      [videoCourseId]
    );
    return rows.map((r) => ({
      courseId: r.course_id,
      courseName: r.course_name,
    }));
  }

  /**
   * List video courses pinned to a live course — used by the Course Hub
   * "videos" section to surface what should appear inside this course.
   */
  static async listVideoCourseIdsForCourse(courseId: string): Promise<string[]> {
    const { rows } = await pool.query<{ video_course_id: string }>(
      `SELECT video_course_id
         FROM video_course_target_courses
        WHERE course_id = $1`,
      [courseId]
    );
    return rows.map((r) => r.video_course_id);
  }
}
