import { Request, Response } from 'express';
import pool from '@/config/database';
import { CourseModel } from '@/models/course.model';

export class TeacherRosterController {
  // GET /api/teacher/students
  // query: page, limit, q
  static async listAllStudents(req: Request, res: Response): Promise<void> {
    try {
      const me = (req as any).user;
      if (!me?.id) {
        res.status(401).json({ success: false, message: 'التحقق مطلوب', errors: ['التحقق مطلوب'] });
        return;
      }

      const page = Math.max(parseInt(String(req.query['page'] || '1')), 1);
      const limit = Math.max(parseInt(String(req.query['limit'] || '10')), 1);
      const q = (req.query['q'] as string | undefined)?.trim();

      const params: any[] = [String(me.id)];
      let p = 2;
      let where = `u.user_type = 'student' AND u.deleted_at IS NULL AND EXISTS (
        SELECT 1 FROM course_bookings cb
        WHERE cb.student_id = u.id
          AND cb.teacher_id = $1
          AND cb.status = 'confirmed'
          AND cb.is_deleted = false
      )`;
      if (q && q !== '') {
        where += ` AND (u.name ILIKE $${p} OR u.phone ILIKE $${p})`;
        params.push(`%${q}%`);
        p++;
      }

      const countQ = `SELECT COUNT(*) FROM users u WHERE ${where}`;
      const dataQ = `
        SELECT u.id::text AS id, u.name AS name
        FROM users u
        WHERE ${where}
        ORDER BY u.name ASC
        LIMIT $${p} OFFSET $${p + 1}
      `;

      const total = parseInt((await pool.query(countQ, params)).rows[0].count);
      const rows = (await pool.query(dataQ, [...params, limit, (page - 1) * limit])).rows;

      res.status(200).json({
        success: true,
        message: 'قائمة طلاب المعلم',
        data: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      console.error('Error listAllStudents:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
    }
  }

  // GET /api/teacher/students/by-course/:courseId
  static async listStudentsByCourse(req: Request, res: Response): Promise<void> {
    try {
      const me = (req as any).user;
      if (!me?.id) {
        res.status(401).json({ success: false, message: 'التحقق مطلوب', errors: ['التحقق مطلوب'] });
        return;
      }
      const courseId = String(req.params['courseId'] || '');
      if (!courseId) {
        res.status(400).json({ success: false, message: 'courseId مطلوب' });
        return;
      }

      // تحقق أن الكورس يخص هذا المعلم
      const own = await CourseModel.findByIdAndTeacher(courseId, String(me.id));
      if (!own) {
        res.status(404).json({ success: false, message: 'الكورس غير موجود أو غير مخوّل' });
        return;
      }

      const q = `
        SELECT u.id::text AS id, u.name AS name
        FROM course_bookings cb
        JOIN users u ON u.id = cb.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
        WHERE cb.course_id = $1 AND cb.teacher_id = $2 AND cb.status = 'confirmed' AND cb.is_deleted = false
        ORDER BY u.name ASC
      `;
      const rows = (await pool.query(q, [courseId, String(me.id)])).rows;
      res.status(200).json({ success: true, message: 'طلاب الكورس', data: rows });
    } catch (error) {
      console.error('Error listStudentsByCourse:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
    }
  }

  // GET /api/teacher/students/by-session/:sessionId
  static async listStudentsBySession(req: Request, res: Response): Promise<void> {
    try {
      const me = (req as any).user;
      if (!me?.id) {
        res.status(401).json({ success: false, message: 'التحقق مطلوب', errors: ['التحقق مطلوب'] });
        return;
      }
      const sessionId = String(req.params['sessionId'] || '');
      if (!sessionId) {
        res.status(400).json({ success: false, message: 'sessionId مطلوب' });
        return;
      }

      // تحقق ملكية الجلسة
      const ownQ = `SELECT id FROM sessions WHERE id = $1 AND teacher_id = $2 AND is_deleted = false`;
      const ownR = await pool.query(ownQ, [sessionId, String(me.id)]);
      if (ownR.rowCount === 0) {
        res.status(404).json({ success: false, message: 'الجلسة غير موجودة أو غير مخوّل' });
        return;
      }

      const q = `
        SELECT u.id::text AS id, u.name AS name
        FROM session_attendees sa
        JOIN users u ON u.id = sa.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
        WHERE sa.session_id = $1
        ORDER BY u.name ASC
      `;
      const rows = (await pool.query(q, [sessionId])).rows;
      res.status(200).json({ success: true, message: 'طلاب الجلسة', data: rows });
    } catch (error) {
      console.error('Error listStudentsBySession:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
    }
  }

  // GET /api/teacher/sessions/names
  // query: courseId (optional)
  static async listSessionNames(req: Request, res: Response): Promise<void> {
    try {
      const me = (req as any).user;
      if (!me?.id) {
        res.status(401).json({ success: false, message: 'التحقق مطلوب', errors: ['التحقق مطلوب'] });
        return;
      }
      const courseId = (req.query['courseId'] as string | undefined) || undefined;

      const params: any[] = [String(me.id)];
      let where = 'teacher_id = $1 AND is_deleted = false';
      if (courseId) {
        where += ' AND course_id = $2';
        params.push(courseId);
      }

      const q = `
        SELECT id::text AS id, COALESCE(title, '') AS title, weekday, start_time, end_time
        FROM sessions
        WHERE ${where}
        ORDER BY weekday, start_time
      `;
      const rows = (await pool.query(q, params)).rows;
      res.status(200).json({ success: true, message: 'جلسات المعلم', data: rows });
    } catch (error) {
      console.error('Error listSessionNames:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
    }
  }

  // GET /api/teacher/courses/names (may already exist) – fallback minimal implementation
  static async listCourseNames(req: Request, res: Response): Promise<void> {
    try {
      const me = (req as any).user;
      if (!me?.id) {
        res.status(401).json({ success: false, message: 'التحقق مطلوب', errors: ['التحقق مطلوب'] });
        return;
      }
      // Return all non-deleted courses for teacher: id + course_name
      const q = `
        SELECT id::text AS id, course_name
        FROM courses
        WHERE teacher_id = $1 AND is_deleted = false
        ORDER BY course_name ASC
      `;
      const rows = (await pool.query(q, [String(me.id)])).rows;
      res.status(200).json({ success: true, message: 'كورسات المعلم', data: rows });
    } catch (error) {
      console.error('Error listCourseNames:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
    }
  }
}
