// VideoCourseModel — raw pg queries for video_courses + video_lessons.
//
// Phase 10.1.A scope: every read path + admin moderation writes + webhook
// reconcile writes. Teacher CRUD writes (insert / update / delete) ship in
// 10.1.B.
//
// SQL is parameterized everywhere. Identifier interpolation is forbidden
// per project rules — the few "dynamic" pieces (ORDER BY, WHERE conjuncts)
// are built from a hand-maintained whitelist.

import pool from '../config/database';
import {
  VideoCourse,
  VideoCourseStatus,
  VideoCourseVisibility,
  VideoLesson,
  VideoLessonBunnyStatus,
} from '../types';

// Shared SELECT column lists — both surfaces map snake_case columns to
// camelCase fields at the SQL level so the controller / service layer
// never sees a raw column name.

const VIDEO_COURSE_COLUMNS = `
  id,
  teacher_id      AS "teacherId",
  title,
  description,
  subject,
  teaching_stage  AS "teachingStage",
  grade_id        AS "gradeId",
  cover_image     AS "coverImage",
  price,
  is_free         AS "isFree",
  visibility,
  status,
  reviewed_by     AS "reviewedBy",
  reviewed_at     AS "reviewedAt",
  review_notes    AS "reviewNotes",
  created_at      AS "createdAt",
  updated_at      AS "updatedAt",
  deleted_at      AS "deletedAt"
`;

const VIDEO_LESSON_COLUMNS = `
  id,
  course_id            AS "courseId",
  title,
  description,
  display_order        AS "displayOrder",
  duration_seconds     AS "durationSeconds",
  bunny_library_id     AS "bunnyLibraryId",
  bunny_video_id       AS "bunnyVideoId",
  bunny_thumbnail_url  AS "bunnyThumbnailUrl",
  bunny_playback_url   AS "bunnyPlaybackUrl",
  bunny_status         AS "bunnyStatus",
  bunny_last_synced_at AS "bunnyLastSyncedAt",
  created_at           AS "createdAt",
  updated_at           AS "updatedAt",
  deleted_at           AS "deletedAt"
`;

// Whitelisted text columns we'll allow ILIKE search against. Keeps the
// admin search free-text but immune to interpolation.
const ADMIN_SEARCH_COLUMNS = ['title', 'description', 'subject', 'teaching_stage'];

// ----------------------------------------------------------------------------
// VideoCourseModel
// ----------------------------------------------------------------------------

export class VideoCourseModel {
  // ---- READS ----------------------------------------------------------------

  /**
   * Fetch one course by id (regardless of status / visibility / ownership).
   * Callers decide whether the result is safe to expose.
   */
  static async findById(id: string): Promise<VideoCourse | null> {
    const { rows } = await pool.query<VideoCourse>(
      `SELECT ${VIDEO_COURSE_COLUMNS}
         FROM video_courses
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1`,
      [id]
    );
    return rows[0] ?? null;
  }

  /**
   * Public + student list. Hard-coded to `approved` + `public` so any
   * caller of this method is safe to expose the result to anonymous users.
   */
  static async findManyForPublic(args: {
    offset: number;
    limit: number;
    subject?: string;
    teachingStage?: string;
  }): Promise<{ rows: VideoCourse[]; total: number }> {
    const where: string[] = [
      'deleted_at IS NULL',
      "status = 'approved'",
      "visibility = 'public'",
    ];
    const params: unknown[] = [];

    if (args.subject) {
      params.push(args.subject);
      where.push(`subject = $${params.length}`);
    }
    if (args.teachingStage) {
      params.push(args.teachingStage);
      where.push(`teaching_stage = $${params.length}`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const { rows: countRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM video_courses ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.count ?? 0);

    params.push(args.limit, args.offset);
    const { rows } = await pool.query<VideoCourse>(
      `SELECT ${VIDEO_COURSE_COLUMNS}
         FROM video_courses
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { rows, total };
  }

  /**
   * Teacher's own courses (any status). Caller must already have asserted
   * `req.user.userType === 'teacher'` and provide their own id.
   */
  static async findManyForTeacher(args: {
    teacherId: string;
    offset: number;
    limit: number;
    status?: VideoCourseStatus;
  }): Promise<{ rows: VideoCourse[]; total: number }> {
    const where: string[] = ['deleted_at IS NULL', 'teacher_id = $1'];
    const params: unknown[] = [args.teacherId];

    if (args.status) {
      params.push(args.status);
      where.push(`status = $${params.length}`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const { rows: countRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM video_courses ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.count ?? 0);

    params.push(args.limit, args.offset);
    const { rows } = await pool.query<VideoCourse>(
      `SELECT ${VIDEO_COURSE_COLUMNS}
         FROM video_courses
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { rows, total };
  }

  /**
   * Super-admin browse with full filter set.
   */
  static async findManyForAdmin(args: {
    offset: number;
    limit: number;
    status?: VideoCourseStatus;
    visibility?: VideoCourseVisibility;
    subject?: string;
    teachingStage?: string;
    teacherId?: string;
    search?: string;
  }): Promise<{ rows: VideoCourse[]; total: number }> {
    const where: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];

    if (args.status) {
      params.push(args.status);
      where.push(`status = $${params.length}`);
    }
    if (args.visibility) {
      params.push(args.visibility);
      where.push(`visibility = $${params.length}`);
    }
    if (args.subject) {
      params.push(args.subject);
      where.push(`subject = $${params.length}`);
    }
    if (args.teachingStage) {
      params.push(args.teachingStage);
      where.push(`teaching_stage = $${params.length}`);
    }
    if (args.teacherId) {
      params.push(args.teacherId);
      where.push(`teacher_id = $${params.length}`);
    }
    if (args.search) {
      params.push(`%${args.search}%`);
      const idx = params.length;
      const orClauses = ADMIN_SEARCH_COLUMNS.map((c) => `${c} ILIKE $${idx}`).join(' OR ');
      where.push(`(${orClauses})`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const { rows: countRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM video_courses ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.count ?? 0);

    params.push(args.limit, args.offset);
    const { rows } = await pool.query<VideoCourse>(
      `SELECT ${VIDEO_COURSE_COLUMNS}
         FROM video_courses
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { rows, total };
  }

  // ---- ADMIN WRITES ---------------------------------------------------------

  /** Set status + record the reviewer + (optional) review notes atomically. */
  static async updateStatus(args: {
    id: string;
    status: VideoCourseStatus;
    reviewedBy: string;
    reviewNotes: string | null;
  }): Promise<VideoCourse | null> {
    const { rows } = await pool.query<VideoCourse>(
      `UPDATE video_courses
          SET status       = $2,
              reviewed_by  = $3,
              reviewed_at  = NOW(),
              review_notes = $4
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING ${VIDEO_COURSE_COLUMNS}`,
      [args.id, args.status, args.reviewedBy, args.reviewNotes]
    );
    return rows[0] ?? null;
  }

  /** Soft-delete (super-admin only). Sets deleted_at = NOW(). */
  static async softDelete(id: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      `UPDATE video_courses SET deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  }
}

// ----------------------------------------------------------------------------
// VideoLessonModel
// ----------------------------------------------------------------------------

export class VideoLessonModel {
  static async findByCourse(courseId: string): Promise<VideoLesson[]> {
    const { rows } = await pool.query<VideoLesson>(
      `SELECT ${VIDEO_LESSON_COLUMNS}
         FROM video_lessons
        WHERE course_id = $1 AND deleted_at IS NULL
        ORDER BY display_order ASC, created_at ASC`,
      [courseId]
    );
    return rows;
  }

  static async findById(id: string): Promise<VideoLesson | null> {
    const { rows } = await pool.query<VideoLesson>(
      `SELECT ${VIDEO_LESSON_COLUMNS}
         FROM video_lessons
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1`,
      [id]
    );
    return rows[0] ?? null;
  }

  static async findByBunnyVideoId(bunnyVideoId: string): Promise<VideoLesson | null> {
    const { rows } = await pool.query<VideoLesson>(
      `SELECT ${VIDEO_LESSON_COLUMNS}
         FROM video_lessons
        WHERE bunny_video_id = $1 AND deleted_at IS NULL
        LIMIT 1`,
      [bunnyVideoId]
    );
    return rows[0] ?? null;
  }

  /**
   * Webhook + manual reconcile path. Updates the Bunny-derived fields
   * atomically and stamps bunny_last_synced_at.
   */
  static async applyBunnyState(args: {
    bunnyVideoId: string;
    status: VideoLessonBunnyStatus;
    thumbnailUrl?: string | null;
    playbackUrl?: string | null;
    durationSeconds?: number | null;
  }): Promise<VideoLesson | null> {
    const { rows } = await pool.query<VideoLesson>(
      `UPDATE video_lessons
          SET bunny_status         = $2,
              bunny_thumbnail_url  = COALESCE($3, bunny_thumbnail_url),
              bunny_playback_url   = COALESCE($4, bunny_playback_url),
              duration_seconds     = COALESCE($5, duration_seconds),
              bunny_last_synced_at = NOW()
        WHERE bunny_video_id = $1 AND deleted_at IS NULL
        RETURNING ${VIDEO_LESSON_COLUMNS}`,
      [
        args.bunnyVideoId,
        args.status,
        args.thumbnailUrl ?? null,
        args.playbackUrl ?? null,
        args.durationSeconds ?? null,
      ]
    );
    return rows[0] ?? null;
  }
}
