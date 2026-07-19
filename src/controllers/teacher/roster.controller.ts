import type { Request, Response } from 'express';

import pool from '../../config/database';
import { CourseModel } from '../../models/course.model';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';
import { formatTime12Arabic } from '../../utils/time-format.util';

export class TeacherRosterController {
  // GET /api/teacher/students
  static async listAllStudents(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { page, limit } = parsePagination(req.query);
    const q = (req.query as { q?: string }).q?.trim();

    const params: unknown[] = [teacherId];
    let p = 2;
    let where = `u.user_type = 'student' AND u.deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM course_bookings cb
       WHERE cb.student_id = u.id
         AND cb.teacher_id = $1
         AND cb.status = 'confirmed'
         AND cb.is_deleted = false
    )`;
    if (q) {
      where += ` AND (u.name ILIKE $${p} OR u.phone ILIKE $${p})`;
      params.push(`%${q}%`);
      p++;
    }

    const total = parseInt((await pool.query(`SELECT COUNT(*) FROM users u WHERE ${where}`, params)).rows[0].count);
    const rows = (
      await pool.query(
        `SELECT u.id::text AS id, u.name AS name
           FROM users u
          WHERE ${where}
          ORDER BY u.name ASC
          LIMIT $${p} OFFSET $${p + 1}`,
        [...params, limit, (page - 1) * limit]
      )
    ).rows;

    res.status(200).json(paginated(rows, buildPaginationMeta(total, page, limit), 'قائمة طلاب المعلم'));
  }

  // GET /api/teacher/students/by-course/:courseId/paginated
  static async listStudentsByCoursePaginated(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const courseId = req.params['courseId'] as string;

    const ownership = await CourseModel.findByIdAndTeacher(courseId, teacherId);
    if (!ownership) {
      throw new ApiError(404, 'الكورس غير موجود أو غير مخوّل', ErrorCodes.NOT_FOUND);
    }

    const { page, limit } = parsePagination(req.query);
    const q = (req.query as { q?: string }).q?.trim();

    const params: unknown[] = [teacherId, courseId];
    let p = 3;
    let where = `cb.teacher_id = $1 AND cb.course_id = $2 AND cb.status = 'confirmed' AND cb.is_deleted = false
      AND u.user_type = 'student' AND u.deleted_at IS NULL`;
    if (q) {
      where += ` AND (u.name ILIKE $${p} OR u.phone ILIKE $${p})`;
      params.push(`%${q}%`);
      p++;
    }

    const total = parseInt(
      (
        await pool.query(
          `SELECT COUNT(*) FROM course_bookings cb JOIN users u ON u.id = cb.student_id WHERE ${where}`,
          params
        )
      ).rows[0].count
    );
    const rows = (
      await pool.query(
        `SELECT u.id::text AS id, u.name AS name
           FROM course_bookings cb
           JOIN users u ON u.id = cb.student_id
          WHERE ${where}
          ORDER BY u.name ASC
          LIMIT $${p} OFFSET $${p + 1}`,
        [...params, limit, (page - 1) * limit]
      )
    ).rows;

    res
      .status(200)
      .json(paginated(rows, buildPaginationMeta(total, page, limit), 'طلاب الكورس (مؤكدين) مع باجينيشن'));
  }

  // GET /api/teacher/students/by-course/:courseId
  static async listStudentsByCourse(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const courseId = req.params['courseId'] as string;
    const ownership = await CourseModel.findByIdAndTeacher(courseId, teacherId);
    if (!ownership) {
      throw new ApiError(404, 'الكورس غير موجود أو غير مخوّل', ErrorCodes.NOT_FOUND);
    }
    const rows = (
      await pool.query(
        `SELECT u.id::text AS id, u.name AS name
           FROM course_bookings cb
           JOIN users u ON u.id = cb.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
          WHERE cb.course_id = $1 AND cb.teacher_id = $2 AND cb.status = 'confirmed' AND cb.is_deleted = false
          ORDER BY u.name ASC`,
        [courseId, teacherId]
      )
    ).rows;
    res.status(200).json(ok(rows, 'طلاب الكورس'));
  }

  // GET /api/teacher/students/by-session/:sessionId
  static async listStudentsBySession(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const sessionId = req.params['sessionId'] as string;
    const ownR = await pool.query(
      `SELECT id FROM sessions WHERE id = $1 AND teacher_id = $2 AND is_deleted = false`,
      [sessionId, teacherId]
    );
    if (ownR.rowCount === 0) {
      throw new ApiError(404, 'الجلسة غير موجودة أو غير مخوّل', ErrorCodes.NOT_FOUND);
    }
    const rows = (
      await pool.query(
        `SELECT u.id::text AS id, u.name AS name
           FROM session_attendees sa
           JOIN users u ON u.id = sa.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
          WHERE sa.session_id = $1
          ORDER BY u.name ASC`,
        [sessionId]
      )
    ).rows;
    res.status(200).json(ok(rows, 'طلاب الجلسة'));
  }

  // GET /api/teacher/sessions/names
  static async listSessionNames(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const courseId = (req.query as { courseId?: string }).courseId;
    const params: unknown[] = [teacherId];
    let where = 'teacher_id = $1 AND is_deleted = false';
    if (courseId) {
      where += ' AND course_id = $2';
      params.push(courseId);
    }
    const rows = (
      await pool.query(
        `SELECT id::text AS id, COALESCE(title, '') AS title, weekday, start_time, end_time
           FROM sessions
          WHERE ${where}
          ORDER BY weekday, start_time`,
        params
      )
    ).rows.map((row: any) => ({
      ...row,
      start_time_24h: row.start_time,
      end_time_24h: row.end_time,
      start_time: formatTime12Arabic(row.start_time),
      end_time: formatTime12Arabic(row.end_time),
    }));
    res.status(200).json(ok(rows, 'جلسات المعلم'));
  }

  // GET /api/teacher/courses/names (legacy fallback)
  static async listCourseNames(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const rows = (
      await pool.query(
        `SELECT id::text AS id, course_name
           FROM courses
          WHERE teacher_id = $1 AND is_deleted = false
          ORDER BY course_name ASC`,
        [teacherId]
      )
    ).rows;
    res.status(200).json(ok(rows, 'كورسات المعلم'));
  }
}
