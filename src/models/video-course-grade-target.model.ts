// CRUD for video_course_grade_targets (pivot: video_course → grades).
// Phase 1 scope: data access only — service-layer validation (ownership,
// access-type compatibility) lives in Phase 2 / 3.

import pool from '../config/database';

export interface VideoCourseGradeTargetRow {
  video_course_id: string;
  grade_id: string;
  created_at: Date;
}

export interface VideoCourseGradeWithName {
  gradeId: string;
  gradeName: string;
}

export class VideoCourseGradeTargetModel {
  /**
   * Replace-set sync of grade targets for a video course. Runs inside the
   * caller's transaction when `client` is passed, otherwise uses the
   * default pool.
   *
   * Semantics:
   *   - DELETE rows whose grade_id is NOT in `gradeIds`.
   *   - INSERT … ON CONFLICT DO NOTHING for every id in `gradeIds`.
   * The composite PK (video_course_id, grade_id) makes the upsert
   * trivially idempotent.
   */
  static async sync(
    videoCourseId: string,
    gradeIds: string[],
    client?: any
  ): Promise<void> {
    const db = client || pool;
    const dedup = Array.from(new Set(gradeIds));

    await db.query(
      `DELETE FROM video_course_grade_targets
        WHERE video_course_id = $1
          AND NOT (grade_id = ANY($2::uuid[]))`,
      [videoCourseId, dedup]
    );

    if (dedup.length === 0) return;

    await db.query(
      `INSERT INTO video_course_grade_targets (video_course_id, grade_id)
       SELECT $1, grade_id
         FROM UNNEST($2::uuid[]) AS grade_id
       ON CONFLICT (video_course_id, grade_id) DO NOTHING`,
      [videoCourseId, dedup]
    );
  }

  /**
   * List the grades a video course targets, joined to grades.name so
   * client renders without a second lookup.
   */
  static async listForVideoCourse(
    videoCourseId: string
  ): Promise<VideoCourseGradeWithName[]> {
    const { rows } = await pool.query<{ grade_id: string; name: string }>(
      `SELECT vcgt.grade_id, g.name
         FROM video_course_grade_targets vcgt
         JOIN grades g ON g.id = vcgt.grade_id
        WHERE vcgt.video_course_id = $1
          AND g.deleted_at IS NULL
        ORDER BY g.name ASC`,
      [videoCourseId]
    );
    return rows.map((r) => ({ gradeId: r.grade_id, gradeName: r.name }));
  }

  /**
   * List video_course_ids that target a given grade. Used by the
   * student catalog filter "show me videos for my grade".
   */
  static async listVideoCourseIdsForGrade(gradeId: string): Promise<string[]> {
    const { rows } = await pool.query<{ video_course_id: string }>(
      `SELECT video_course_id
         FROM video_course_grade_targets
        WHERE grade_id = $1`,
      [gradeId]
    );
    return rows.map((r) => r.video_course_id);
  }
}
