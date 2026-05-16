import type { Request, Response } from 'express';

import pool from '../../config/database';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';

export class SuperAdminTeacherController {
  // GET /api/super-admin/teachers
  static async listTeachers(req: Request, res: Response): Promise<void> {
    const { page, limit, offset } = parsePagination(req.query);
    const search = (req.query as { search?: string }).search?.trim();

    const where: string[] = ["u.user_type = 'teacher'", 'u.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;
    if (search) {
      where.push(`(u.name ILIKE $${idx} OR u.email ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    const whereClause = `WHERE ${where.join(' AND ')}`;

    const countQuery = `SELECT COUNT(*)::int AS count FROM users u ${whereClause}`;
    const dataQuery = `
      SELECT u.id, u.name, u.email, u.phone, u.address, u.status, u.created_at,
             u.profile_image_path, u.experience_years
        FROM users u
        ${whereClause}
        ORDER BY u.created_at DESC
        LIMIT $${idx} OFFSET $${idx + 1}
    `;

    const [countR, dataR] = await Promise.all([
      pool.query(countQuery, params),
      pool.query(dataQuery, [...params, limit, offset]),
    ]);
    const total = countR.rows[0]?.count ?? 0;
    res
      .status(200)
      .json(paginated(dataR.rows, buildPaginationMeta(total, page, limit), 'قائمة المعلمين'));
  }

  // GET /api/super-admin/teachers/:id
  static async getTeacherDetails(req: Request, res: Response): Promise<void> {
    const teacherId = req.params['id'] as string;

    const teacherQuery = `
      SELECT u.id, u.name, u.email, u.phone, u.address, u.bio, u.status,
             u.created_at, u.profile_image_path, u.experience_years
        FROM users u
       WHERE u.id = $1
         AND u.user_type = 'teacher'
         AND u.deleted_at IS NULL
    `;

    const statsQuery = `
      SELECT
        (SELECT COUNT(*)::int FROM courses c WHERE c.teacher_id = $1 AND c.is_deleted = false) AS total_courses,
        (SELECT COUNT(DISTINCT cb.student_id)::int FROM course_bookings cb WHERE cb.teacher_id = $1 AND cb.is_deleted = false) AS total_students,
        (SELECT COUNT(*)::int FROM course_bookings cb WHERE cb.teacher_id = $1 AND cb.is_deleted = false) AS total_bookings,
        (SELECT COUNT(*)::int FROM course_bookings cb WHERE cb.teacher_id = $1 AND cb.status = 'pending' AND cb.is_deleted = false) AS pending_bookings,
        (SELECT COUNT(*)::int FROM course_bookings cb WHERE cb.teacher_id = $1 AND cb.status = 'pre_approved' AND cb.is_deleted = false) AS pre_approved_bookings,
        (SELECT COUNT(*)::int FROM course_bookings cb WHERE cb.teacher_id = $1 AND cb.status = 'confirmed' AND cb.is_deleted = false) AS confirmed_bookings,
        (SELECT COUNT(*)::int FROM course_bookings cb WHERE cb.teacher_id = $1 AND cb.status = 'rejected' AND cb.is_deleted = false) AS rejected_bookings,
        (SELECT COUNT(*)::int FROM course_bookings cb WHERE cb.teacher_id = $1 AND cb.status = 'cancelled' AND cb.is_deleted = false) AS cancelled_bookings
    `;

    const coursesQuery = `
      SELECT c.id, c.course_name, c.study_year, c.start_date, c.end_date,
             c.price, c.seats_count, c.is_deleted
        FROM courses c
       WHERE c.teacher_id = $1
       ORDER BY c.created_at DESC
       LIMIT 50
    `;

    const [teacherR, statsR, coursesR] = await Promise.all([
      pool.query(teacherQuery, [teacherId]),
      pool.query(statsQuery, [teacherId]),
      pool.query(coursesQuery, [teacherId]),
    ]);

    if (teacherR.rows.length === 0) {
      throw new ApiError(404, 'المعلم غير موجود', ErrorCodes.NOT_FOUND);
    }

    const teacher = teacherR.rows[0];
    const stats = statsR.rows[0] || {};

    res.status(200).json(
      ok(
        {
          teacher,
          stats: {
            totalCourses: stats.total_courses ?? 0,
            totalStudents: stats.total_students ?? 0,
            totalBookings: stats.total_bookings ?? 0,
            pendingBookings: stats.pending_bookings ?? 0,
            preApprovedBookings: stats.pre_approved_bookings ?? 0,
            confirmedBookings: stats.confirmed_bookings ?? 0,
            rejectedBookings: stats.rejected_bookings ?? 0,
            cancelledBookings: stats.cancelled_bookings ?? 0,
          },
          recentCourses: coursesR.rows,
        },
        'بيانات المعلم مع الإحصائيات'
      )
    );
  }
}
