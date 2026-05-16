import type { Request, Response } from 'express';

import pool from '../../config/database';
import { NotificationService } from '../../services/notification.service';
import { StudentEvaluationService } from '../../services/student-evaluation.service';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';

const getService = (): StudentEvaluationService => new StudentEvaluationService();

const requireOwnership = async (id: string, teacherId: string) => {
  const svc = getService();
  const item = await svc.getById(id);
  if (!item) {
    throw new ApiError(404, 'التقييم غير موجود', ErrorCodes.NOT_FOUND);
  }
  if (String(item.teacher_id) !== teacherId) {
    throw new ApiError(403, 'الوصول مرفوض', ErrorCodes.FORBIDDEN);
  }
  return item;
};

export class TeacherStudentEvaluationController {
  // POST /api/teacher/evaluations/bulk-upsert
  static async bulkUpsert(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { eval_date, items } = req.body as { eval_date: string; items: any[] };

    const svc = getService();
    const rows = await svc.upsertMany(teacherId, String(eval_date), items);

    try {
      const notif = req.app.get('notificationService') as NotificationService;
      for (const ev of rows) {
        await notif.createAndSendNotification({
          title: 'تم تقييمك من قبل المعلم',
          message: `تم تسجيل/تحديث تقييمك بتاريخ ${new Date(ev.eval_date).toLocaleDateString()}`,
          type: 'teacher_message' as any,
          priority: 'medium',
          recipientType: 'specific_students' as any,
          recipientIds: [String(ev.student_id)],
          data: {
            subType: 'student_evaluation',
            evaluationId: String(ev.id),
            evalDate: ev.eval_date,
            ratings: {
              scientific_level: ev.scientific_level,
              behavioral_level: ev.behavioral_level,
              attendance_level: ev.attendance_level,
              homework_preparation: ev.homework_preparation,
              participation_level: ev.participation_level,
              instruction_following: ev.instruction_following,
            },
            guidance: ev.guidance ?? null,
            notes: ev.notes ?? null,
          },
          createdBy: teacherId,
        });
      }
    } catch (err) {
      req.log?.warn({ err }, 'evaluation bulk-upsert notification failed');
    }

    res.status(200).json(ok(rows, 'تم حفظ التقييمات'));
  }

  // PATCH /api/teacher/evaluations/:id
  static async update(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    await requireOwnership(id, teacherId);
    const svc = getService();
    const updated = await svc.update(id, req.body || {});

    try {
      if (updated) {
        const notif = req.app.get('notificationService') as NotificationService;
        await notif.createAndSendNotification({
          title: 'تم تحديث تقييمك',
          message: `قام المعلم بتحديث تقييمك بتاريخ ${new Date(updated.eval_date).toLocaleDateString()}`,
          type: 'teacher_message' as any,
          priority: 'medium',
          recipientType: 'specific_students' as any,
          recipientIds: [String(updated.student_id)],
          data: {
            subType: 'student_evaluation',
            evaluationId: String(updated.id),
            evalDate: updated.eval_date,
          },
          createdBy: teacherId,
        });
      }
    } catch (err) {
      req.log?.warn({ err }, 'evaluation update notification failed');
    }

    res.status(200).json(ok(updated, 'تم تحديث التقييم'));
  }

  // GET /api/teacher/evaluations
  static async list(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const query = req.query as unknown as {
      page?: number;
      limit?: number;
      studentId?: string;
      from?: string;
      to?: string;
    };
    const { page, limit } = parsePagination(query);
    const filters: any = { page, limit };
    if (query.studentId) filters.studentId = query.studentId;
    if (query.from) filters.from = query.from;
    if (query.to) filters.to = query.to;

    const svc = getService();
    const result = await svc.listForTeacher(teacherId, filters);
    const rows = result.data;

    const studentIds = Array.from(new Set(rows.map((r) => String((r as any).student_id)))).filter(Boolean);
    if (studentIds.length > 0) {
      const info = await pool.query(
        `SELECT u.id::text AS student_id,
                u.name AS student_name,
                (
                  SELECT c.course_name
                    FROM course_bookings cb
                    JOIN courses c ON c.id = cb.course_id
                   WHERE cb.teacher_id = $1
                     AND cb.student_id = u.id
                     AND cb.status = 'confirmed'
                     AND cb.is_deleted = false
                   ORDER BY cb.created_at DESC
                   LIMIT 1
                ) AS course_name
           FROM users u
          WHERE u.id = ANY($2::uuid[])`,
        [teacherId, studentIds]
      );
      const mapInfo = new Map<string, { student_name: string | null; course_name: string | null }>();
      for (const r of info.rows) {
        mapInfo.set(String(r.student_id), {
          student_name: r.student_name || null,
          course_name: r.course_name || null,
        });
      }
      for (const item of rows as any[]) {
        const mi = mapInfo.get(String(item.student_id));
        item.student_name = mi?.student_name ?? null;
        item.course_name = mi?.course_name ?? null;
      }
    }

    res
      .status(200)
      .json(paginated(rows, buildPaginationMeta(result.total, page, limit), 'تم جلب التقييمات'));
  }

  // GET /api/teacher/evaluations/:id
  static async getById(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const item = await requireOwnership(id, teacherId);
    res.status(200).json(ok(item, 'تم جلب التقييم'));
  }

  // GET /api/teacher/evaluations/students-with-eval
  static async studentsWithEvaluation(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const query = req.query as unknown as {
      date: string;
      courseId?: string;
      sessionId?: string;
      page?: number;
      limit?: number;
    };
    const { page, limit, offset } = parsePagination({ ...query, limit: query.limit ?? 50 });

    const params: unknown[] = [teacherId, query.date];
    if (query.sessionId) params.push(query.sessionId);
    if (query.courseId) params.push(query.courseId);
    params.push(limit, offset);

    const q = `
      WITH targeted AS (
        ${query.sessionId
          ? `SELECT DISTINCT sa.student_id
               FROM session_attendees sa
              WHERE sa.session_id = $3`
          : ''}
        ${query.sessionId && query.courseId ? 'UNION' : ''}
        ${query.courseId
          ? `SELECT DISTINCT cb.student_id
               FROM course_bookings cb
              WHERE cb.course_id = $${query.sessionId ? 4 : 3}
                AND cb.teacher_id = $1
                AND cb.status = 'confirmed'
                AND cb.is_deleted = false`
          : ''}
      )
      SELECT u.id::text AS student_id, u.name AS student_name,
             se.id::text AS evaluation_id,
             se.eval_date,
             se.scientific_level, se.behavioral_level, se.attendance_level,
             se.homework_preparation, se.participation_level, se.instruction_following,
             se.guidance, se.notes
        FROM targeted t
        JOIN users u ON u.id = t.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
        LEFT JOIN student_evaluations se
          ON se.student_id = u.id
         AND se.teacher_id = $1
         AND se.eval_date_date = DATE($2)
       ORDER BY u.name ASC
       LIMIT $${query.sessionId && query.courseId ? 5 : 4} OFFSET $${query.sessionId && query.courseId ? 6 : 5}
    `;

    const rows = (await pool.query(q, params)).rows;
    res
      .status(200)
      .json(paginated(rows, buildPaginationMeta(rows.length, page, limit), 'الطلاب مع تقييمهم'));
  }
}
