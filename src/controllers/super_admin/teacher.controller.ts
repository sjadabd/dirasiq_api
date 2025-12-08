import { Request, Response } from 'express';
import pool from '../../config/database';

export class SuperAdminTeacherController {
  // GET /api/super-admin/teachers
  static async listTeachers(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query['page'] as string) || 1;
      const limit = parseInt(req.query['limit'] as string) || 10;
      const offset = (page - 1) * limit;
      const search = (req.query['search'] as string | undefined)?.trim();

      const where: string[] = [
        "u.user_type = 'teacher'",
        'u.deleted_at IS NULL',
      ];
      const params: any[] = [];
      let idx = 1;

      if (
        search &&
        search !== 'null' &&
        search !== 'undefined' &&
        search !== ''
      ) {
        where.push(`(u.name ILIKE $${idx} OR u.email ILIKE $${idx})`);
        params.push(`%${search}%`);
        idx++;
      }

      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const countQuery = `
        SELECT COUNT(*)::int AS count
        FROM users u
        ${whereClause}
      `;

      const dataQuery = `
        SELECT
          u.id,
          u.name,
          u.email,
          u.phone,
          u.address,
          u.status,
          u.created_at,
          u.profile_image_path,
          u.experience_years
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

      res.status(200).json({
        success: true,
        message: 'قائمة المعلمين',
        data: dataR.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error(
        'Error in SuperAdminTeacherController.listTeachers:',
        error
      );
      res.status(500).json({
        success: false,
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }

  // GET /api/super-admin/teachers/:id
  static async getTeacherDetails(req: Request, res: Response): Promise<void> {
    try {
      const teacherId = req.params['id'];
      if (!teacherId) {
        res.status(400).json({
          success: false,
          message: 'معرف المعلم مطلوب',
          errors: ['معرف المعلم مطلوب'],
        });
        return;
      }

      const teacherQuery = `
        SELECT
          u.id,
          u.name,
          u.email,
          u.phone,
          u.address,
          u.bio,
          u.status,
          u.created_at,
          u.profile_image_path,
          u.experience_years
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
        SELECT
          c.id,
          c.course_name,
          c.study_year,
          c.start_date,
          c.end_date,
          c.price,
          c.seats_count,
          c.is_deleted
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
        res.status(404).json({
          success: false,
          message: 'المعلم غير موجود',
          errors: ['المعلم غير موجود'],
        });
        return;
      }

      const teacher = teacherR.rows[0];
      const stats = statsR.rows[0] || {};

      res.status(200).json({
        success: true,
        message: 'بيانات المعلم مع الإحصائيات',
        data: {
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
      });
    } catch (error) {
      console.error(
        'Error in SuperAdminTeacherController.getTeacherDetails:',
        error
      );
      res.status(500).json({
        success: false,
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }
}
