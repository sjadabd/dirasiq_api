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
  access_type                 AS "accessType",
  free_for_enrolled_students  AS "freeForEnrolledStudents",
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

  // ---- MARKETPLACE / STUDENT-AUTH READS (Phase 1 of marketplace rebuild) ---

  /**
   * Marketplace browse for a student. Filters down to videos that:
   *   1. are approved + not deleted,
   *   2. carry an access_type that makes marketplace sense
   *      (public_free_by_grade OR marketplace_paid) — enrolled_students_free
   *      videos are NEVER in the marketplace; they only surface in the
   *      Course Hub of the related teacher's live courses,
   *   3. pass fn_student_can_view_video_course OR (for paid videos the
   *      student has not yet bought) at least carry a grade match so the
   *      buy-it-now flow has a target — this means a paid card can still
   *      appear in the marketplace even if the student hasn't paid yet
   *      (they need to be able to discover it to buy it).
   *
   * The "can-view OR grade-match-on-paid" rule is encoded as:
   *
   *   fn_student_can_view_video_course(student, vc.id)
   *     OR (vc.access_type = 'marketplace_paid'
   *         AND EXISTS (
   *           SELECT 1 FROM video_course_grade_targets vcgt
   *             JOIN student_grades sg ON sg.grade_id = vcgt.grade_id
   *            WHERE vcgt.video_course_id = vc.id
   *              AND sg.student_id = $student
   *              AND sg.study_year = <active>
   *              AND sg.deleted_at IS NULL
   *              AND sg.is_active = TRUE
   *         ))
   *
   * Sort options:
   *   newest   → created_at DESC
   *   popular  → lifetime paid_purchase count DESC, then created_at DESC
   *   trending → paid_purchase count in last 7 days DESC, then created_at DESC
   *   price_asc / price_desc — exact name says it
   *
   * `recommended` is intentionally omitted from this method — the ranking
   * uses join keys that don't compose with the simple WHERE pipeline.
   * Phase 2.B (a later step) will add it as a separate method.
   */
  static async findManyForStudentMarketplace(args: {
    studentId: string;
    offset: number;
    limit: number;
    subject?: string;
    teacherId?: string;
    gradeId?: string;
    priceMax?: number;
    sort?: 'newest' | 'popular' | 'trending' | 'price_asc' | 'price_desc';
  }): Promise<{ rows: VideoCourse[]; total: number }> {
    const params: unknown[] = [args.studentId];
    const studentParam = '$1';

    const where: string[] = [
      'vc.deleted_at IS NULL',
      "vc.status = 'approved'",
      "vc.access_type IN ('public_free_by_grade','marketplace_paid')",
    ];

    // Eligibility: either the access function says yes, OR the row is a
    // paid marketplace card the student qualifies to BUY (grade match).
    where.push(
      `(
        fn_student_can_view_video_course(${studentParam}, vc.id)
        OR (
          vc.access_type = 'marketplace_paid'
          AND EXISTS (
            SELECT 1
              FROM video_course_grade_targets vcgt
              JOIN student_grades sg ON sg.grade_id = vcgt.grade_id
             WHERE vcgt.video_course_id = vc.id
               AND sg.student_id        = ${studentParam}
               AND sg.study_year        = (SELECT year FROM academic_years WHERE is_active = TRUE LIMIT 1)
               AND sg.deleted_at IS NULL
               AND sg.is_active = TRUE
          )
        )
      )`
    );

    if (args.subject) {
      params.push(args.subject);
      where.push(`vc.subject = $${params.length}`);
    }
    if (args.teacherId) {
      params.push(args.teacherId);
      where.push(`vc.teacher_id = $${params.length}`);
    }
    if (args.gradeId) {
      params.push(args.gradeId);
      where.push(
        `EXISTS (SELECT 1 FROM video_course_grade_targets
                  WHERE video_course_id = vc.id AND grade_id = $${params.length})`
      );
    }
    if (typeof args.priceMax === 'number') {
      params.push(args.priceMax);
      where.push(`vc.price <= $${params.length}`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const orderBy = (() => {
      switch (args.sort) {
        case 'popular':
          return `(SELECT COUNT(*) FROM video_course_purchases
                    WHERE video_course_id = vc.id AND status = 'paid') DESC,
                  vc.created_at DESC`;
        case 'trending':
          return `(SELECT COUNT(*) FROM video_course_purchases
                    WHERE video_course_id = vc.id
                      AND status = 'paid'
                      AND paid_at > NOW() - INTERVAL '7 days') DESC,
                  vc.created_at DESC`;
        case 'price_asc':
          return 'vc.price ASC, vc.created_at DESC';
        case 'price_desc':
          return 'vc.price DESC, vc.created_at DESC';
        case 'newest':
        default:
          return 'vc.created_at DESC';
      }
    })();

    const { rows: countRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM video_courses vc ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.count ?? 0);

    params.push(args.limit, args.offset);
    const { rows } = await pool.query<VideoCourse>(
      `SELECT ${VIDEO_COURSE_COLUMNS.replace(/  /g, ' ')}
         FROM video_courses vc
         ${whereSql}
        ORDER BY ${orderBy}
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { rows, total };
  }

  /**
   * My Library — the videos this student currently has access to. Equivalent
   * to "what the student owns or has been granted access to". Implemented
   * via the access function (closed-by-default), filtered to approved rows.
   *
   * Sort: newest acquired first. We approximate acquisition time with the
   * MAX(paid_at | granted_at | created_at) per row so the natural reading is
   * "the freshly-added videos at the top".
   */
  static async findManyForStudentLibrary(args: {
    studentId: string;
    offset: number;
    limit: number;
  }): Promise<{ rows: VideoCourse[]; total: number }> {
    const params: unknown[] = [args.studentId];

    const whereSql = `
      WHERE vc.deleted_at IS NULL
        AND vc.status = 'approved'
        AND fn_student_can_view_video_course($1, vc.id)
    `;

    const { rows: countRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM video_courses vc ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.count ?? 0);

    params.push(args.limit, args.offset);
    const { rows } = await pool.query<VideoCourse>(
      `SELECT ${VIDEO_COURSE_COLUMNS.replace(/  /g, ' ')}
         FROM video_courses vc
         ${whereSql}
        ORDER BY GREATEST(
                   COALESCE((SELECT paid_at FROM video_course_purchases
                              WHERE video_course_id = vc.id
                                AND student_id      = $1
                                AND status          = 'paid'
                              ORDER BY paid_at DESC LIMIT 1),
                            'epoch'::timestamptz),
                   COALESCE((SELECT granted_at FROM video_course_free_students
                              WHERE video_course_id = vc.id
                                AND student_id      = $1
                              LIMIT 1),
                            'epoch'::timestamptz),
                   vc.created_at
                 ) DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { rows, total };
  }

  /**
   * Course-Hub videos — the video courses pinned to a given live course
   * via video_course_target_courses, restricted to approved rows. Access
   * is enforced via the function so a card that would not pass the check
   * is hidden (which is the right default — a student seeing a Hub video
   * they can't access produces a worse UX than not seeing it at all).
   *
   * Phase 2 returns rows the student can VIEW. Phase 3 may add a "preview"
   * flag for "you can see it but must buy" — defer.
   */
  static async findManyForCourseHub(args: {
    studentId: string;
    courseId: string;
    offset: number;
    limit: number;
  }): Promise<{ rows: VideoCourse[]; total: number }> {
    const params: unknown[] = [args.studentId, args.courseId];

    const whereSql = `
      WHERE vc.deleted_at IS NULL
        AND vc.status = 'approved'
        AND EXISTS (
            SELECT 1 FROM video_course_target_courses
             WHERE video_course_id = vc.id AND course_id = $2
        )
        AND fn_student_can_view_video_course($1, vc.id)
    `;

    const { rows: countRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM video_courses vc ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.count ?? 0);

    params.push(args.limit, args.offset);
    const { rows } = await pool.query<VideoCourse>(
      `SELECT ${VIDEO_COURSE_COLUMNS.replace(/  /g, ' ')}
         FROM video_courses vc
         ${whereSql}
        ORDER BY vc.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { rows, total };
  }

  // ---- TEACHER WRITES (Phase 10.1.B) ---------------------------------------

  static async insert(args: {
    teacherId: string;
    title: string;
    description: string | null;
    subject: string;
    teachingStage: string;
    gradeId: string | null;
    isFree: boolean;
    price: number;
    visibility: VideoCourseVisibility;
    // Phase 3 — required NOT NULL on the column (migration 047 backfilled
    // every existing row so the column is always populated).
    accessType: string;
    freeForEnrolledStudents: boolean;
  }, client?: any): Promise<VideoCourse> {
    const db = client || pool;
    const result = (await db.query(
      `INSERT INTO video_courses
         (teacher_id, title, description, subject, teaching_stage, grade_id,
          is_free, price, visibility, status,
          access_type, free_for_enrolled_students)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending_review',
               $10, $11)
       RETURNING ${VIDEO_COURSE_COLUMNS}`,
      [
        args.teacherId,
        args.title,
        args.description,
        args.subject,
        args.teachingStage,
        args.gradeId,
        args.isFree,
        args.price,
        args.visibility,
        args.accessType,
        args.freeForEnrolledStudents,
      ]
    )) as { rows: VideoCourse[] };
    return result.rows[0]!;
  }

  /**
   * Whitelisted partial update. Builds SET clauses only for keys actually
   * present in `updates` to avoid clobbering unrelated columns.
   *
   * Side-effect: any teacher-side edit forces the row back to pending_review
   * so the super-admin re-reviews the changes. The caller's contract is
   * "this is a teacher edit; please re-review" — so this is intentional.
   */
  static async updateForTeacher(args: {
    id: string;
    teacherId: string;
    updates: Partial<{
      title: string;
      description: string | null;
      subject: string;
      teachingStage: string;
      gradeId: string | null;
      isFree: boolean;
      price: number;
      visibility: VideoCourseVisibility;
      // Phase 3 marketplace fields.
      accessType: string;
      freeForEnrolledStudents: boolean;
    }>;
  }, client?: any): Promise<VideoCourse | null> {
    const db = client || pool;
    const setClauses: string[] = [];
    const params: unknown[] = [args.id, args.teacherId];

    const map: Record<string, string> = {
      title: 'title',
      description: 'description',
      subject: 'subject',
      teachingStage: 'teaching_stage',
      gradeId: 'grade_id',
      isFree: 'is_free',
      price: 'price',
      visibility: 'visibility',
      accessType: 'access_type',
      freeForEnrolledStudents: 'free_for_enrolled_students',
    };
    for (const [k, col] of Object.entries(map)) {
      const v = (args.updates as Record<string, unknown>)[k];
      if (v === undefined) continue;
      params.push(v);
      setClauses.push(`${col} = $${params.length}`);
    }

    // Always reset moderation state on a teacher edit — see method doc.
    setClauses.push(`status = 'pending_review'`);
    setClauses.push(`reviewed_by = NULL`);
    setClauses.push(`reviewed_at = NULL`);
    setClauses.push(`review_notes = NULL`);

    if (setClauses.length === 4) {
      // Only the moderation-reset clauses, no real changes. Pivot syncs
      // are handled separately in the service layer.
      return this.findById(args.id);
    }

    const result = (await db.query(
      `UPDATE video_courses
          SET ${setClauses.join(', ')}
        WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL
        RETURNING ${VIDEO_COURSE_COLUMNS}`,
      params
    )) as { rows: VideoCourse[] };
    return result.rows[0] ?? null;
  }

  /**
   * Teacher-side soft delete. Same WHERE clause as updateForTeacher — the
   * ownership check is part of the SQL so a forged id from another teacher
   * is silently a no-op (returns false → caller throws 404).
   */
  static async softDeleteForTeacher(args: {
    id: string;
    teacherId: string;
  }): Promise<boolean> {
    const { rowCount } = await pool.query(
      `UPDATE video_courses SET deleted_at = NOW()
        WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL`,
      [args.id, args.teacherId]
    );
    return (rowCount ?? 0) > 0;
  }

  /** Set cover_image (relative URL like /public/...). */
  static async setCoverImage(args: {
    id: string;
    teacherId: string;
    coverImage: string;
  }): Promise<VideoCourse | null> {
    const { rows } = await pool.query<VideoCourse>(
      `UPDATE video_courses
          SET cover_image = $3
        WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL
        RETURNING ${VIDEO_COURSE_COLUMNS}`,
      [args.id, args.teacherId, args.coverImage]
    );
    return rows[0] ?? null;
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

  // ---- TEACHER WRITES (Phase 10.1.B.1.c) -----------------------------------

  /**
   * Insert a new lesson. Bunny fields are pre-populated by the caller after
   * BunnyStreamService.createVideo() mints the videoId — they're persisted
   * up front so the webhook reconcile path can match them.
   */
  static async insert(args: {
    courseId: string;
    title: string;
    description: string | null;
    displayOrder: number;
    bunnyLibraryId: string | null;
    bunnyVideoId: string | null;
  }): Promise<VideoLesson> {
    const { rows } = await pool.query<VideoLesson>(
      `INSERT INTO video_lessons
         (course_id, title, description, display_order,
          bunny_library_id, bunny_video_id, bunny_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING ${VIDEO_LESSON_COLUMNS}`,
      [
        args.courseId,
        args.title,
        args.description,
        args.displayOrder,
        args.bunnyLibraryId,
        args.bunnyVideoId,
      ]
    );
    return rows[0]!;
  }

  /**
   * Whitelisted partial update of teacher-editable fields. Bunny fields
   * are NEVER touched here — the webhook/sync path owns them.
   */
  static async updateForOwner(args: {
    id: string;
    courseId: string;
    updates: Partial<{ title: string; description: string | null; displayOrder: number }>;
  }): Promise<VideoLesson | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [args.id, args.courseId];
    const map: Record<string, string> = {
      title: 'title',
      description: 'description',
      displayOrder: 'display_order',
    };
    for (const [k, col] of Object.entries(map)) {
      const v = (args.updates as Record<string, unknown>)[k];
      if (v === undefined) continue;
      params.push(v);
      setClauses.push(`${col} = $${params.length}`);
    }
    if (setClauses.length === 0) return this.findById(args.id);

    const { rows } = await pool.query<VideoLesson>(
      `UPDATE video_lessons
          SET ${setClauses.join(', ')}
        WHERE id = $1 AND course_id = $2 AND deleted_at IS NULL
        RETURNING ${VIDEO_LESSON_COLUMNS}`,
      params
    );
    return rows[0] ?? null;
  }

  /** Soft-delete by id within a known course. */
  static async softDelete(args: {
    id: string;
    courseId: string;
  }): Promise<boolean> {
    const { rowCount } = await pool.query(
      `UPDATE video_lessons SET deleted_at = NOW()
        WHERE id = $1 AND course_id = $2 AND deleted_at IS NULL`,
      [args.id, args.courseId]
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * Bulk reorder. Caller supplies the new sequence of lessonIds — index in
   * the array becomes the new display_order. Wrapped in a single statement
   * via `UPDATE ... FROM (VALUES ...)` so the whole reorder is atomic.
   *
   * Defensive: only touches lessons that belong to `courseId`, so a stray
   * id from another course in the payload is a no-op.
   */
  static async reorder(args: {
    courseId: string;
    lessonIds: string[];
  }): Promise<number> {
    if (args.lessonIds.length === 0) return 0;

    // Build VALUES list as ($1::uuid, 0), ($2::uuid, 1), …
    const valuesSql = args.lessonIds
      .map((_, i) => `($${i + 2}::uuid, ${i})`)
      .join(', ');

    const params: unknown[] = [args.courseId, ...args.lessonIds];

    const { rowCount } = await pool.query(
      `UPDATE video_lessons
          SET display_order = src.idx
         FROM (VALUES ${valuesSql}) AS src(id, idx)
        WHERE video_lessons.id = src.id
          AND video_lessons.course_id = $1
          AND video_lessons.deleted_at IS NULL`,
      params
    );
    return rowCount ?? 0;
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
