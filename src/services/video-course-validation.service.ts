// Phase 3 of the National Video Marketplace.
//
// Domain validation that lives BETWEEN Zod (per-field type checks) and
// the persistence layer (raw SQL): "given a teacher and a list of ids,
// do those ids actually belong to this teacher's reach?"
//
// Two checks Phase 3 needs every teacher-side write to perform:
//
//   1. validateTargetCoursesOwnership(teacherId, courseIds)
//        Every courseId in `targetCourseIds` MUST be a live course owned
//        by this teacher. A teacher can't pin their video course to a
//        live course they don't teach.
//
//   2. validateFreeStudentsRelationship(teacherId, studentIds)
//        Every studentId in `freeStudentIds` MUST have at least one
//        non-cancelled booking with this teacher (any status that
//        represents a real student-teacher relationship — pending,
//        pre_approved, confirmed, approved). This stops a teacher from
//        granting free access to a random user they have no business
//        relationship with.
//
// Both methods throw ApiError(400, ..., INVALID_REQUEST) with a field
// hint so the controller doesn't have to re-wrap. They batch the lookup
// into a single query each so the cost is constant regardless of list
// size.

import pool from '../config/database';
import { ApiError, ErrorCodes } from '../utils/api-error';

// Statuses that represent a real student-teacher relationship from the
// teacher's perspective. Cancelled is excluded because the teacher might
// have rejected the booking — granting free access to a rejected student
// is unlikely to be the teacher's intent. Reactivation flips the status
// back to `pending`, so reactivated bookings are covered.
const ACTIVE_BOOKING_STATUSES = [
  'pending',
  'pre_approved',
  'confirmed',
  'approved',
] as const;

export class VideoCourseValidationService {
  /**
   * Verify every id in `courseIds` is a live course owned by `teacherId`.
   * Empty / missing inputs are a no-op success.
   */
  static async validateTargetCoursesOwnership(
    teacherId: string,
    courseIds: string[] | undefined
  ): Promise<void> {
    if (!courseIds || courseIds.length === 0) return;

    const dedup = Array.from(new Set(courseIds));

    const { rows } = await pool.query<{ id: string }>(
      `SELECT id
         FROM courses
        WHERE id = ANY($1::uuid[])
          AND teacher_id = $2
          AND is_deleted = FALSE`,
      [dedup, teacherId]
    );

    if (rows.length === dedup.length) return;

    const owned = new Set(rows.map((r) => r.id));
    const offending = dedup.filter((id) => !owned.has(id));

    throw new ApiError(
      400,
      'بعض الدورات المختارة لا تخصك',
      ErrorCodes.INVALID_REQUEST,
      { field: 'targetCourseIds', offending }
    );
  }

  /**
   * Verify every id in `studentIds` has an active booking with
   * `teacherId`. Empty / missing inputs are a no-op success.
   */
  static async validateFreeStudentsRelationship(
    teacherId: string,
    studentIds: string[] | undefined
  ): Promise<void> {
    if (!studentIds || studentIds.length === 0) return;

    const dedup = Array.from(new Set(studentIds));

    const { rows } = await pool.query<{ student_id: string }>(
      `SELECT DISTINCT student_id
         FROM course_bookings
        WHERE student_id = ANY($1::uuid[])
          AND teacher_id = $2
          AND status     = ANY($3::text[])
          AND is_deleted = FALSE`,
      [dedup, teacherId, ACTIVE_BOOKING_STATUSES as readonly string[]]
    );

    if (rows.length === dedup.length) return;

    const related = new Set(rows.map((r) => r.student_id));
    const offending = dedup.filter((id) => !related.has(id));

    throw new ApiError(
      400,
      'بعض الطلاب المختارين ليسوا مرتبطين بك',
      ErrorCodes.INVALID_REQUEST,
      { field: 'freeStudentIds', offending }
    );
  }
}
