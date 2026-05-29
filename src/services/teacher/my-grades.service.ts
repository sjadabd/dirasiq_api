// Teacher self-service grade-set management — used by the Flutter
// teacher profile screen and (future) the dashboard profile-setup page.
//
// Why this service even exists:
//   - auth.service.updateProfile() silently ignores `gradeIds` (it only
//     touches `users` columns).
//   - auth.service.completeProfile() + UserModel.createMany do INSERT-only,
//     so unchecking a grade and re-saving leaves the old row in place.
// Both gaps mean the "edit my grades" UX has no working backend — this
// service fills it.
//
// Semantics — `syncForActiveYear` is replace-set:
//   - Soft-delete rows currently present whose grade_id is NOT in the
//     incoming set.
//   - INSERT … ON CONFLICT (teacher_id, grade_id, study_year) DO UPDATE
//     SET deleted_at = NULL, is_active = TRUE for rows in the set. This
//     handles both "brand new" and "previously soft-deleted" cases in one
//     statement; the UNIQUE constraint on the table doesn't include
//     deleted_at, so plain INSERT would fail on a re-add.
//
// Everything runs in one transaction so a partial failure can't leave a
// half-synced state.

import pool from '../../config/database';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { logger } from '../../utils/logger';

export interface TeacherMyGradeRow {
  id: string;
  gradeId: string;
  gradeName: string;
  studyYear: string;
  createdAt: string;
}

export class TeacherMyGradesService {
  /**
   * Read current grades for the teacher in the active academic year.
   * Used to hydrate the profile screen's FilterChips on open.
   */
  static async listForActiveYear(teacherId: string): Promise<{
    studyYear: string | null;
    grades: TeacherMyGradeRow[];
  }> {
    const studyYear = await this.activeStudyYear();
    if (!studyYear) {
      return { studyYear: null, grades: [] };
    }
    const rows = await this.fetchActive(teacherId, studyYear);
    return { studyYear, grades: rows };
  }

  /**
   * Replace-set sync of teacher_grades for (teacherId, activeStudyYear).
   * Throws when no academic year is active OR any gradeId is unknown /
   * inactive. Returns the resulting list so the client can hydrate
   * without a follow-up GET.
   */
  static async syncForActiveYear(
    teacherId: string,
    gradeIds: string[]
  ): Promise<{ studyYear: string; grades: TeacherMyGradeRow[] }> {
    const studyYear = await this.activeStudyYear();
    if (!studyYear) {
      throw new ApiError(
        400,
        'لا توجد سنة دراسية فعّالة حالياً — تواصل مع الإدارة',
        ErrorCodes.BUSINESS_RULE
      );
    }

    // Validate every gradeId against the catalog. Inactive / soft-deleted
    // grades are rejected here so the client gets one clean error instead
    // of a partial save.
    const desiredSet = Array.from(new Set(gradeIds));
    const { rows: validRows } = await pool.query<{ id: string }>(
      `SELECT id
         FROM grades
        WHERE id = ANY($1::uuid[])
          AND is_active = TRUE
          AND deleted_at IS NULL`,
      [desiredSet]
    );
    if (validRows.length !== desiredSet.length) {
      throw new ApiError(
        400,
        'بعض المراحل الدراسية المختارة غير صالحة',
        ErrorCodes.INVALID_REQUEST,
        { field: 'gradeIds' }
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Soft-delete the rows that fell out of the set. We intentionally
      //    do NOT hard-delete — the teacher_grades row is referenced by
      //    courses (FK study_year, grade_id) and the soft-delete column
      //    is the documented v2 pattern. A revival on a later sync clears
      //    deleted_at in step 2.
      await client.query(
        `UPDATE teacher_grades
            SET deleted_at = NOW(),
                is_active  = FALSE
          WHERE teacher_id  = $1
            AND study_year  = $2
            AND deleted_at IS NULL
            AND NOT (grade_id = ANY($3::uuid[]))`,
        [teacherId, studyYear, desiredSet]
      );

      // 2. Upsert every grade in the set. The unique index on
      //    (teacher_id, grade_id, study_year) is the conflict target;
      //    re-adding a previously-soft-deleted row clears deleted_at +
      //    re-activates it without raising 23505.
      await client.query(
        `INSERT INTO teacher_grades (teacher_id, grade_id, study_year)
         SELECT $1, grade_id, $2
           FROM UNNEST($3::uuid[]) AS grade_id
         ON CONFLICT (teacher_id, grade_id, study_year)
         DO UPDATE SET deleted_at = NULL,
                       is_active  = TRUE,
                       updated_at = NOW()`,
        [teacherId, studyYear, desiredSet]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    const grades = await this.fetchActive(teacherId, studyYear);
    logger.info(
      { teacherId, studyYear, count: grades.length },
      'teacher synced own grade set'
    );
    return { studyYear, grades };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private static async activeStudyYear(): Promise<string | null> {
    const { rows } = await pool.query<{ year: string }>(
      `SELECT year FROM academic_years WHERE is_active = TRUE LIMIT 1`
    );
    return rows[0]?.year ?? null;
  }

  private static async fetchActive(
    teacherId: string,
    studyYear: string
  ): Promise<TeacherMyGradeRow[]> {
    const { rows } = await pool.query<{
      id: string;
      grade_id: string;
      grade_name: string;
      study_year: string;
      created_at: string;
    }>(
      `SELECT tg.id,
              tg.grade_id,
              g.name        AS grade_name,
              tg.study_year,
              tg.created_at
         FROM teacher_grades tg
         JOIN grades g ON g.id = tg.grade_id
        WHERE tg.teacher_id = $1
          AND tg.study_year = $2
          AND tg.deleted_at IS NULL
          AND tg.is_active  = TRUE
          AND g.deleted_at  IS NULL
        ORDER BY g.name ASC`,
      [teacherId, studyYear]
    );
    return rows.map((r) => ({
      id: r.id,
      gradeId: r.grade_id,
      gradeName: r.grade_name,
      studyYear: r.study_year,
      createdAt: r.created_at,
    }));
  }
}
