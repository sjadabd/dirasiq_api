import { Request, Response } from 'express';
import { StudentEvaluationService } from '@/services/student-evaluation.service';
import { NotificationService } from '@/services/notification.service';

export class TeacherStudentEvaluationController {
  static getService(): StudentEvaluationService { return new StudentEvaluationService(); }

  // POST /api/teacher/evaluations/bulk-upsert
  // body: { eval_date: string (ISO), items: [{ student_id, scientific_level, behavioral_level, attendance_level, homework_preparation, participation_level, instruction_following, guidance?, notes? }] }
  static async bulkUpsert(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }

      const { eval_date, items } = req.body || {};
      if (!eval_date || !Array.isArray(items) || items.length === 0) {
        res.status(400).json({ success: false, message: 'eval_date و items مطلوبة' });
        return;
      }

      const svc = TeacherStudentEvaluationController.getService();
      const rows = await svc.upsertMany(String(me.id), String(eval_date), items);

      // Notify each student evaluated
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
            createdBy: String(me.id),
          });
        }
      } catch (e) {
        console.error('Error sending evaluation notifications:', e);
      }

      res.status(200).json({ success: true, data: rows });
    } catch (error) {
      console.error('Error bulk upsert evaluations:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // PATCH /api/teacher/evaluations/:id
  static async update(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const id = String(req.params['id']);
      const svc = TeacherStudentEvaluationController.getService();

      const current = await svc.getById(id);
      if (!current) { res.status(404).json({ success: false, message: 'غير موجود' }); return; }
      if (String(current.teacher_id) !== String(me.id)) { res.status(403).json({ success: false, message: 'غير مصرح' }); return; }

      const updated = await svc.update(id, req.body || {});

      // Notify student of update
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
            createdBy: String(me.id),
          });
        }
      } catch (e) {
        console.error('Error sending evaluation update notification:', e);
      }

      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      console.error('Error update evaluation:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // GET /api/teacher/evaluations
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const { studentId, from, to } = (req.query as any) || {};
      const page = parseInt(String((req.query as any)['page'] ?? '1'), 10);
      const limit = parseInt(String((req.query as any)['limit'] ?? '20'), 10);
      const svc = TeacherStudentEvaluationController.getService();
      const filters: any = { page, limit };
      if (studentId) filters.studentId = String(studentId);
      if (from) filters.from = String(from);
      if (to) filters.to = String(to);
      const result = await svc.listForTeacher(String(me.id), filters);

      // Enrich with student_name and course_name (latest confirmed course with this teacher)
      const rows = result.data;
      const studentIds = Array.from(new Set(rows.map(r => String((r as any).student_id)))).filter(Boolean);
      if (studentIds.length > 0) {
        const pool = (require('@/config/database') as any).default || require('@/config/database');
        const q = `
          SELECT u.id::text AS student_id,
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
          WHERE u.id = ANY($2::uuid[])
        `;
        const info = await pool.query(q, [String(me.id), studentIds]);
        const mapInfo = new Map<string, { student_name: string | null; course_name: string | null }>();
        for (const r of info.rows) {
          mapInfo.set(String(r.student_id), { student_name: r.student_name || null, course_name: r.course_name || null });
        }
        for (const item of rows as any[]) {
          const mi = mapInfo.get(String(item.student_id));
          item.student_name = mi?.student_name ?? null;
          item.course_name = mi?.course_name ?? null;
        }
      }

      res.status(200).json({ success: true, data: rows, pagination: { page, limit, total: result.total } });
    } catch (error) {
      console.error('Error list evaluations:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // GET /api/teacher/evaluations/:id
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const id = String(req.params['id']);
      const svc = TeacherStudentEvaluationController.getService();
      const item = await svc.getById(id);
      if (!item) { res.status(404).json({ success: false, message: 'غير موجود' }); return; }
      if (String(item.teacher_id) !== String(me.id)) { res.status(403).json({ success: false, message: 'غير مصرح' }); return; }
      res.status(200).json({ success: true, data: item });
    } catch (error) {
      console.error('Error get evaluation:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // GET /api/teacher/evaluations/students-with-eval?date=YYYY-MM-DD|ISO&courseId=&sessionId=&page=&limit=
  // Returns teacher's students targeted by course or session with their evaluation for the given date (or null if not evaluated)
  static async studentsWithEvaluation(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const dateRaw = String((req.query as any)['date'] || '');
      const courseId = (req.query as any)['courseId'] ? String((req.query as any)['courseId']) : undefined;
      const sessionId = (req.query as any)['sessionId'] ? String((req.query as any)['sessionId']) : undefined;
      const page = parseInt(String((req.query as any)['page'] ?? '1'), 10);
      const limit = parseInt(String((req.query as any)['limit'] ?? '50'), 10);
      if (!dateRaw) { res.status(400).json({ success: false, message: 'حقل التاريخ مطلوب (date)' }); return; }
      if (!courseId && !sessionId) { res.status(400).json({ success: false, message: 'الفلترة مطلوبة عبر courseId أو sessionId' }); return; }

      const pool = (require('@/config/database') as any).default || require('@/config/database');
      const offset = (page - 1) * limit;

      // Build targeted students (by session attendees and/or course bookings)
      const whereParts: string[] = [];
      const params: any[] = [String(me.id), dateRaw];
      let p = 3;
      if (sessionId) { whereParts.push(`sa.session_id = $${p}`); params.push(sessionId); p++; }
      if (courseId) { whereParts.push(`(cb.course_id = $${p} AND cb.teacher_id = $1 AND cb.status = 'confirmed' AND cb.is_deleted = false)`); params.push(courseId); p++; }

      // Because we inlined positional params above, recompose a cleaner query building
      // Safer explicit version below (avoids param confusion):
      const q = `
        WITH targeted AS (
          ${sessionId ? `
            SELECT DISTINCT sa.student_id
            FROM session_attendees sa
            WHERE sa.session_id = $3
          ` : ''}
          ${sessionId && courseId ? 'UNION' : ''}
          ${courseId ? `
            SELECT DISTINCT cb.student_id
            FROM course_bookings cb
            WHERE cb.course_id = $${sessionId ? 4 : 3}
              AND cb.teacher_id = $1
              AND cb.status = 'confirmed'
              AND cb.is_deleted = false
          ` : ''}
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
        LIMIT $${sessionId && courseId ? 5 : 4} OFFSET $${sessionId && courseId ? 6 : 5}
      `;

      // Build parameters in order: [teacherId, date, (sessionId?), (courseId?), limit, offset]
      const qParams: any[] = [String(me.id), dateRaw];
      if (sessionId) qParams.push(sessionId);
      if (courseId) qParams.push(courseId);
      qParams.push(limit, offset);

      const rows = (await pool.query(q, qParams)).rows;
      res.status(200).json({ success: true, data: rows, pagination: { page, limit, total: rows.length } });
    } catch (error) {
      console.error('Error list students with evaluation:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }
}
