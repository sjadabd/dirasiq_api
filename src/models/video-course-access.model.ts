// Thin wrapper around the SQL function fn_student_can_view_video_course
// (migration 053). This is the single source of truth for "can student S
// view video course V?" — every Phase 2+ route that gates listing,
// detail, or playback calls through here.
//
// Keeping it in the model layer (and NOT the service layer) is
// deliberate: services in this codebase own business decisions; the
// access predicate is pure data — given student + video, the DB knows
// the answer.
//
// The function is STABLE on the PG side, so the optimiser is happy to
// fold it into joins / IN clauses. There is no caching here — the
// authoritative answer is recomputed on every call.

import pool from '../config/database';

export class VideoCourseAccessModel {
  /**
   * Returns true iff the access function returned TRUE for this
   * (student, video_course) pair.
   *
   * NULL inputs return false (the function closes by default; this
   * mirrors that on the TS side so the call site doesn't have to guard).
   */
  static async canView(
    studentId: string | null | undefined,
    videoCourseId: string | null | undefined
  ): Promise<boolean> {
    if (!studentId || !videoCourseId) return false;

    const { rows } = await pool.query<{ allowed: boolean }>(
      `SELECT fn_student_can_view_video_course($1, $2) AS allowed`,
      [studentId, videoCourseId]
    );
    return rows[0]?.allowed ?? false;
  }

  /**
   * Bulk filter — given a list of video course ids, return the subset
   * the student can view. Used by the marketplace listing endpoint to
   * post-filter results without N+1 round trips.
   *
   * Implemented via a single query that calls the function once per id
   * inside SQL (the planner treats STABLE functions as referentially
   * transparent within the snapshot).
   */
  static async filterViewable(
    studentId: string,
    videoCourseIds: string[]
  ): Promise<string[]> {
    if (!studentId || videoCourseIds.length === 0) return [];

    const dedup = Array.from(new Set(videoCourseIds));
    const { rows } = await pool.query<{ video_course_id: string }>(
      `SELECT id AS video_course_id
         FROM UNNEST($2::uuid[]) AS id
        WHERE fn_student_can_view_video_course($1, id) = TRUE`,
      [studentId, dedup]
    );
    return rows.map((r) => r.video_course_id);
  }
}
