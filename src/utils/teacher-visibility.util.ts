/**
 * Restrict a specific test teacher so only one allowlisted student can
 * discover them (suggested lists, search, ads, courses, public listings).
 *
 * Existing relationship surfaces (bookings / enrollments / course hub for
 * already-enrolled students) are intentionally left alone.
 *
 * Defaults match the MulhimIQ test accounts; override via env:
 *   HIDDEN_TEACHER_EMAIL
 *   HIDDEN_TEACHER_VISIBLE_TO_STUDENT_EMAIL
 */

import pool from '../config/database';
import { ApiError, ErrorCodes } from './api-error';

const DEFAULT_HIDDEN_TEACHER_EMAIL = 'www.sjad.n@gmail.com';
const DEFAULT_ALLOWED_STUDENT_EMAIL = 'mulhimiq@gmail.com';

export type TeacherVisibilityIds = {
  hiddenTeacherId: string | null;
  allowedStudentId: string | null;
};

let cache: TeacherVisibilityIds | null = null;
let inflight: Promise<TeacherVisibilityIds> | null = null;

function normalizeEmail(raw: string): string {
  return String(raw).trim().toLowerCase();
}

export class TeacherVisibility {
  static getConfiguredEmails(): {
    hiddenTeacherEmail: string;
    allowedStudentEmail: string;
  } {
    return {
      hiddenTeacherEmail: normalizeEmail(
        process.env['HIDDEN_TEACHER_EMAIL'] || DEFAULT_HIDDEN_TEACHER_EMAIL
      ),
      allowedStudentEmail: normalizeEmail(
        process.env['HIDDEN_TEACHER_VISIBLE_TO_STUDENT_EMAIL'] ||
          DEFAULT_ALLOWED_STUDENT_EMAIL
      ),
    };
  }

  static clearCache(): void {
    cache = null;
  }

  static async resolve(): Promise<TeacherVisibilityIds> {
    if (cache) return cache;
    if (inflight) return inflight;

    inflight = (async () => {
      const { hiddenTeacherEmail, allowedStudentEmail } =
        TeacherVisibility.getConfiguredEmails();
      const { rows } = await pool.query<{ id: string; email: string }>(
        `SELECT id, email::text AS email
           FROM users
          WHERE deleted_at IS NULL
            AND email = ANY($1::citext[])`,
        [[hiddenTeacherEmail, allowedStudentEmail]]
      );

      let hiddenTeacherId: string | null = null;
      let allowedStudentId: string | null = null;
      for (const row of rows) {
        const email = normalizeEmail(row.email);
        if (email === hiddenTeacherEmail) hiddenTeacherId = row.id;
        if (email === allowedStudentEmail) allowedStudentId = row.id;
      }

      const resolved: TeacherVisibilityIds = {
        hiddenTeacherId,
        allowedStudentId,
      };
      // Cache only when the hidden teacher exists so a cold start before
      // the account is created can still pick it up on later requests.
      if (resolved.hiddenTeacherId) {
        cache = resolved;
      }
      return resolved;
    })();

    try {
      return await inflight;
    } finally {
      inflight = null;
    }
  }

  static async canStudentSeeTeacher(
    viewerStudentId: string | null | undefined,
    teacherId: string
  ): Promise<boolean> {
    const { hiddenTeacherId, allowedStudentId } = await this.resolve();
    if (!hiddenTeacherId || teacherId !== hiddenTeacherId) return true;
    return Boolean(
      viewerStudentId &&
        allowedStudentId &&
        viewerStudentId === allowedStudentId
    );
  }

  static async assertStudentCanSeeTeacher(
    viewerStudentId: string | null | undefined,
    teacherId: string
  ): Promise<void> {
    const allowed = await this.canStudentSeeTeacher(
      viewerStudentId,
      teacherId
    );
    if (!allowed) {
      throw new ApiError(404, 'المعلم غير موجود', ErrorCodes.NOT_FOUND);
    }
  }

  /**
   * SQL fragment that hides the restricted teacher unless the viewer is
   * the allowlisted student. When `viewerStudentId` is null (public /
   * unauthenticated), the teacher is always excluded.
   */
  static async sqlHideUnlessAllowed(opts: {
    teacherIdExpr: string;
    viewerStudentId: string | null | undefined;
    nextParam: number;
  }): Promise<{ clause: string; params: unknown[]; nextParam: number }> {
    const { hiddenTeacherId, allowedStudentId } = await this.resolve();
    if (!hiddenTeacherId) {
      return { clause: '', params: [], nextParam: opts.nextParam };
    }

    const p = opts.nextParam;

    if (!opts.viewerStudentId || !allowedStudentId) {
      return {
        clause: ` AND ${opts.teacherIdExpr} <> $${p}`,
        params: [hiddenTeacherId],
        nextParam: p + 1,
      };
    }

    return {
      clause: ` AND (${opts.teacherIdExpr} <> $${p} OR $${p + 1}::uuid = $${p + 2})`,
      params: [hiddenTeacherId, opts.viewerStudentId, allowedStudentId],
      nextParam: p + 3,
    };
  }
}
