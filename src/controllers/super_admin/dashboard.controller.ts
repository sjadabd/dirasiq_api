import { Request, Response } from 'express';
import pool from '../../config/database';

export class SuperAdminDashboardController {
  static async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const queries = {
        totalUsers: `
          SELECT COUNT(*)::int AS count
          FROM users
          WHERE deleted_at IS NULL
        `,
        totalTeachers: `
          SELECT COUNT(*)::int AS count
          FROM users
          WHERE user_type = 'teacher'
            AND deleted_at IS NULL
        `,
        totalStudents: `
          SELECT COUNT(*)::int AS count
          FROM users
          WHERE user_type = 'student'
            AND deleted_at IS NULL
        `,
        activeCourses: `
          SELECT COUNT(*)::int AS count
          FROM courses
          WHERE is_deleted = false
            AND end_date >= CURRENT_DATE
        `,
      } as const;

      const [totalUsersR, totalTeachersR, totalStudentsR, activeCoursesR] =
        await Promise.all([
          pool.query(queries.totalUsers),
          pool.query(queries.totalTeachers),
          pool.query(queries.totalStudents),
          pool.query(queries.activeCourses),
        ]);

      res.status(200).json({
        success: true,
        message: 'احصائيات لوحة تحكم السوبر أدمن',
        data: {
          totalUsers: totalUsersR.rows[0]?.count ?? 0,
          totalTeachers: totalTeachersR.rows[0]?.count ?? 0,
          totalStudents: totalStudentsR.rows[0]?.count ?? 0,
          activeCourses: activeCoursesR.rows[0]?.count ?? 0,
        },
      });
    } catch (error) {
      console.error('Error in SuperAdminDashboardController.getStats:', error);
      res.status(500).json({
        success: false,
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }
}
