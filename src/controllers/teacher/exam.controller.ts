import { Request, Response } from 'express';
import { AcademicYearModel } from '../../models/academic-year.model';
import { ExamModel, ExamType } from '../../models/exam.model';
import { ExamService } from '../../services/exam.service';
import { NotificationService } from '../../services/notification.service';

export class TeacherExamController {
  static getService(): ExamService { return new ExamService(); }

  // body: { course_id, subject_id, sessionIds?: string[], exam_date, exam_type: 'daily'|'monthly', max_score, description?, notes? }
  static async create(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const { course_id, subject_id, sessionIds, exam_date, exam_type, max_score, description, notes } = req.body || {};
      if (!course_id || !subject_id || !exam_date || !exam_type || !max_score) {
        res.status(400).json({ success: false, message: 'course_id, subject_id, exam_date, exam_type, max_score مطلوبة' });
        return;
      }

      const type: ExamType = String(exam_type).toLowerCase() === 'monthly' ? 'monthly' : 'daily';

      const service = TeacherExamController.getService();
      // Create single exam bound to course/subject/teacher
      const ex = await service.createExam({
        course_id: String(course_id),
        subject_id: String(subject_id),
        teacher_id: String(me.id),
        exam_date: String(exam_date),
        exam_type: type,
        max_score: Number(max_score),
        description: description ?? null,
        notes: notes ?? null,
      });

      // Link sessions if provided
      const targetSessions: string[] = Array.isArray(sessionIds) ? sessionIds.map((s: any) => String(s)) : [];
      if (targetSessions.length) {
        await ExamModel.addExamSessions(String(ex.id), targetSessions);
      }

      // Notify students of this exam (distinct across linked sessions or course bookings)
      await TeacherExamController.notifyExamCreated(req, ex);

      res.status(201).json({ success: true, data: ex });
    } catch (error) {
      console.error('Error create exam:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }
  private static async notifyExamCreated(req: Request, exam: any) {
    try {
      const notif = req.app.get('notificationService') as NotificationService;
      const students = await ExamModel.listStudentsForExam(exam);
      const recipientIds = students.map(s => String(s.id));
      if (!recipientIds.length) return;
      const activeYear = await AcademicYearModel.getActive();
      await notif.createAndSendNotification({
        title: 'امتحان جديد',
        message: `تمت إضافة امتحان جديد بتاريخ ${exam.exam_date}`,
        type: 'class_reminder' as any,
        priority: 'medium',
        recipientType: 'specific_students' as any,
        recipientIds,
        data: {
          examId: String(exam.id),
          examType: String(exam.exam_type),
          courseId: String(exam.course_id),
          subType: 'exam',
          studyYear: activeYear?.year || null,
        },
        createdBy: String(exam.teacher_id),
      });
    } catch (e) {
      console.error('Error sending exam creation notification:', e);
    }
  }

  // GET /api/teacher/exams
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const page = parseInt(String((req.query as any)['page'] ?? '1'), 10);
      const limit = parseInt(String((req.query as any)['limit'] ?? '20'), 10);
      const type = (req.query as any)['type'] as string | undefined;
      const service = TeacherExamController.getService();
      const result = await service.listByTeacher(String(me.id), page, limit, type as ExamType | undefined);
      res.status(200).json({ success: true, data: result.data, pagination: { page, limit, total: result.total } });
    } catch (error) {
      console.error('Error list exams:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // GET /api/teacher/exams/:id
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params['id']);
      const service = TeacherExamController.getService();
      const item = await service.getById(id);
      if (!item) { res.status(404).json({ success: false, message: 'غير موجود' }); return; }
      res.status(200).json({ success: true, data: item });
    } catch (error) {
      console.error('Error get exam:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // PATCH /api/teacher/exams/:id
  static async update(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params['id']);
      const service = TeacherExamController.getService();
      const patch = req.body || {};
      if (patch.exam_type) {
        patch.exam_type = String(patch.exam_type).toLowerCase() === 'monthly' ? 'monthly' : 'daily';
      }
      const updated = await service.updateExam(id, patch);
      if (!updated) { res.status(404).json({ success: false, message: 'غير موجود' }); return; }
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      console.error('Error update exam:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // DELETE /api/teacher/exams/:id
  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params['id']);
      const service = TeacherExamController.getService();
      const ok = await service.removeExam(id);
      if (!ok) { res.status(404).json({ success: false, message: 'غير موجود' }); return; }
      res.status(200).json({ success: true, message: 'تم الحذف' });
    } catch (error) {
      console.error('Error delete exam:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // GET /api/teacher/exams/:id/students?sessionId=<uuid>
  // If sessionId is provided and linked to the exam via exam_sessions, return students of that session with their grade for this exam.
  // Otherwise, return distinct students targeted by the exam (linked sessions OR course confirmed bookings) with their grades.
  static async students(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const id = String(req.params['id']);
      const service = TeacherExamController.getService();
      const item = await service.getById(id);
      if (!item) { res.status(404).json({ success: false, message: 'غير موجود' }); return; }
      if (String(item.teacher_id) !== String(me.id)) { res.status(403).json({ success: false, message: 'غير مصرح' }); return; }
      const sessionId = (req.query as any)['sessionId'] ? String((req.query as any)['sessionId']) : undefined;

      if (sessionId) {
        // Ensure session is linked to this exam
        const linkedQ = `SELECT 1 FROM exam_sessions WHERE exam_id = $1 AND session_id = $2 LIMIT 1`;
        // Fallback to pool since ExamModel doesn't expose query; use course/session ownership minimal check via pool
        // We'll check via a simple select using pool directly
        const { default: _unused } = { default: null };
        // Direct query using pool
        const pool = (require('../../config/database') as any).default || require('../../config/database');
        const linkRes = await pool.query(linkedQ, [id, sessionId]);
        if (linkRes.rowCount === 0) {
          res.status(400).json({ success: false, message: 'الجلسة غير مرتبطة بهذا الامتحان' });
          return;
        }

        const q = `
          SELECT u.id::text AS id, u.name AS name,
                 eg.score, eg.graded_at, eg.graded_by
          FROM session_attendees sa
          JOIN users u ON u.id = sa.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
          LEFT JOIN exam_grades eg ON eg.exam_id = $1 AND eg.student_id = u.id
          WHERE sa.session_id = $2
          ORDER BY u.name ASC
        `;
        const rows = (await pool.query(q, [id, sessionId])).rows;
        res.status(200).json({ success: true, data: rows });
        return;
      }

      // No session filter: distinct students targeted by exam (linked sessions OR course confirmed bookings), with grades
      const pool = (require('../../config/database') as any).default || require('../../config/database');
      const q = `
        WITH targeted AS (
          SELECT DISTINCT sa.student_id
          FROM exam_sessions es
          JOIN session_attendees sa ON sa.session_id = es.session_id
          WHERE es.exam_id = $1
          UNION
          SELECT cb.student_id
          FROM course_bookings cb
          WHERE cb.course_id = $2 AND cb.teacher_id = $3 AND cb.status = 'confirmed' AND cb.is_deleted = false
        )
        SELECT u.id::text AS id, u.name AS name,
               eg.score, eg.graded_at, eg.graded_by
        FROM targeted t
        JOIN users u ON u.id = t.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
        LEFT JOIN exam_grades eg ON eg.exam_id = $1 AND eg.student_id = u.id
        ORDER BY u.name ASC
      `;
      const rows = (await pool.query(q, [id, String((item as any).course_id), String((item as any).teacher_id)])).rows;
      res.status(200).json({ success: true, data: rows });
    } catch (error) {
      console.error('Error exam students:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // PUT /api/teacher/exams/:examId/grade/:studentId
  static async grade(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const examId = String(req.params['examId']);
      const studentId = String(req.params['studentId']);
      const { score } = req.body || {};
      const service = TeacherExamController.getService();
      const exam = await service.getById(examId);
      if (!exam) { res.status(404).json({ success: false, message: 'غير موجود' }); return; }
      if (String(exam.teacher_id) !== String(me.id)) { res.status(403).json({ success: false, message: 'غير مصرح' }); return; }
      const numericScore = Number(score);
      if (!Number.isFinite(numericScore)) {
        res.status(400).json({ success: false, message: 'قيمة الدرجة غير صالحة' });
        return;
      }
      if (numericScore < 0) {
        res.status(400).json({ success: false, message: 'لا يمكن أن تكون الدرجة سالبة' });
        return;
      }
      if (numericScore > Number((exam as any).max_score)) {
        res.status(400).json({ success: false, message: `لا يمكن أن تكون الدرجة أكبر من الدرجة القصوى (${Number((exam as any).max_score)})` });
        return;
      }
      const grade = await service.setGrade(examId, studentId, numericScore, String(me.id));
      // Notify the specific student about the new/updated grade
      try {
        const notif = req.app.get('notificationService') as NotificationService;
        await notif.createAndSendNotification({
          title: 'تم تحديث درجتك في الامتحان',
          message: `تم تسجيل/تحديث درجتك (${Number(score)}) لامتحان بتاريخ ${exam.exam_date}`,
          type: 'grade_update' as any,
          priority: 'medium',
          recipientType: 'specific_students' as any,
          recipientIds: [studentId],
          data: {
            subType: 'exam_grade',
            examId: String(exam.id),
            courseId: String((exam as any).course_id),
            subjectId: String((exam as any).subject_id),
            examType: String((exam as any).exam_type),
            studentId: String(studentId),
            score: Number(score),
          },
          createdBy: String(me.id),
        });
      } catch (notifyErr) {
        console.error('Error sending grade notification:', notifyErr);
      }
      res.status(200).json({ success: true, data: grade });
    } catch (error) {
      console.error('Error grade exam:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }
}
