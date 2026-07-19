import type { Request, Response } from 'express';

import pool from '../../config/database';
import { AcademicYearModel } from '../../models/academic-year.model';
import { ExamModel, type ExamType } from '../../models/exam.model';
import { ExamService } from '../../services/exam.service';
import { NotificationService } from '../../services/notification.service';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';
import { formatDateTime12Arabic } from '../../utils/time-format.util';

const getService = (): ExamService => new ExamService();

const normalizeExamType = (raw: string | undefined): ExamType =>
  String(raw ?? '').toLowerCase() === 'monthly' ? 'monthly' : 'daily';

const requireOwnership = async (examId: string, teacherId: string) => {
  const service = getService();
  const exam = await service.getById(examId);
  if (!exam) {
    throw new ApiError(404, 'الامتحان غير موجود', ErrorCodes.NOT_FOUND);
  }
  if (String(exam.teacher_id) !== teacherId) {
    throw new ApiError(403, 'الوصول مرفوض', ErrorCodes.FORBIDDEN);
  }
  return exam;
};

export class TeacherExamController {
  // POST /api/teacher/exams
  static async create(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const body = req.body as Record<string, any>;
    const type = normalizeExamType(body['exam_type']);

    const service = getService();
    const exam = await service.createExam({
      course_id: String(body['course_id']),
      subject_id: String(body['subject_id']),
      teacher_id: teacherId,
      exam_date: String(body['exam_date']),
      exam_type: type,
      max_score: Number(body['max_score']),
      description: body['description'] ?? null,
      notes: body['notes'] ?? null,
    });

    const targetSessions: string[] = Array.isArray(body['sessionIds'])
      ? body['sessionIds'].map((s: any) => String(s))
      : [];
    if (targetSessions.length) {
      await ExamModel.addExamSessions(String(exam.id), targetSessions);
    }

    try {
      const notif = req.app.get('notificationService') as NotificationService;
      const students = await ExamModel.listStudentsForExam(exam);
      const recipientIds = students.map((s) => String(s.id));
      if (recipientIds.length) {
        const activeYear = await AcademicYearModel.getActive();
        await notif.createAndSendNotification({
          title: 'امتحان جديد',
          message: `تمت إضافة امتحان جديد بتاريخ ${formatDateTime12Arabic(exam.exam_date)}`,
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
      }
    } catch (err) {
      req.log?.warn({ err }, 'exam create notification failed');
    }

    res.status(201).json(ok(exam, 'تم إنشاء الامتحان'));
  }

  static async list(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { page, limit } = parsePagination(req.query);
    const type = (req.query as { type?: ExamType }).type;
    const service = getService();
    const result = await service.listByTeacher(teacherId, page, limit, type);
    res
      .status(200)
      .json(paginated(result.data, buildPaginationMeta(result.total, page, limit), 'تم جلب الامتحانات'));
  }

  static async getById(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const service = getService();
    const exam = await service.getById(id);
    if (!exam) {
      throw new ApiError(404, 'الامتحان غير موجود', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(ok(exam, 'تم جلب الامتحان'));
  }

  static async update(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const service = getService();
    const patch = req.body as Record<string, any>;
    if (patch['exam_type']) {
      patch['exam_type'] = normalizeExamType(patch['exam_type'] as string);
    }
    const updated = await service.updateExam(id, patch);
    if (!updated) {
      throw new ApiError(404, 'الامتحان غير موجود', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(ok(updated, 'تم تحديث الامتحان'));
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const service = getService();
    const success = await service.removeExam(id);
    if (!success) {
      throw new ApiError(404, 'الامتحان غير موجود', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(ok(null, 'تم حذف الامتحان'));
  }

  // GET /api/teacher/exams/:id/students?sessionId=<uuid>
  static async students(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const exam = await requireOwnership(id, teacherId);
    const sessionId = (req.query as { sessionId?: string }).sessionId;

    if (sessionId) {
      const linkRes = await pool.query(
        `SELECT 1 FROM exam_sessions WHERE exam_id = $1 AND session_id = $2 LIMIT 1`,
        [id, sessionId]
      );
      if (linkRes.rowCount === 0) {
        throw new ApiError(
          400,
          'الجلسة غير مرتبطة بهذا الامتحان',
          ErrorCodes.BUSINESS_RULE
        );
      }
      const rows = (
        await pool.query(
          `SELECT u.id::text AS id, u.name AS name,
                  eg.score, eg.graded_at, eg.graded_by
             FROM session_attendees sa
             JOIN users u ON u.id = sa.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
             LEFT JOIN exam_grades eg ON eg.exam_id = $1 AND eg.student_id = u.id
            WHERE sa.session_id = $2
            ORDER BY u.name ASC`,
          [id, sessionId]
        )
      ).rows;
      res.status(200).json(ok(rows, 'الطلاب المستهدفون'));
      return;
    }

    const rows = (
      await pool.query(
        `WITH targeted AS (
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
          ORDER BY u.name ASC`,
        [id, String((exam as any).course_id), String((exam as any).teacher_id)]
      )
    ).rows;
    res.status(200).json(ok(rows, 'الطلاب المستهدفون'));
  }

  // PUT /api/teacher/exams/:examId/grade/:studentId
  static async grade(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const examId = req.params['examId'] as string;
    const studentId = req.params['studentId'] as string;
    const { score } = req.body as { score: number };
    const numericScore = Number(score);

    const exam = await requireOwnership(examId, teacherId);
    if (numericScore < 0) {
      throw new ApiError(400, 'لا يمكن أن تكون الدرجة سالبة', ErrorCodes.BUSINESS_RULE);
    }
    const max = Number((exam as any).max_score);
    if (numericScore > max) {
      throw new ApiError(
        400,
        `لا يمكن أن تكون الدرجة أكبر من الدرجة القصوى (${max})`,
        ErrorCodes.BUSINESS_RULE
      );
    }
    const service = getService();
    const grade = await service.setGrade(examId, studentId, numericScore, teacherId);

    try {
      const notif = req.app.get('notificationService') as NotificationService;
      await notif.createAndSendNotification({
        title: 'تم تحديث درجتك في الامتحان',
        message: `تم تسجيل/تحديث درجتك (${numericScore}) لامتحان بتاريخ ${formatDateTime12Arabic(exam.exam_date)}`,
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
          studentId,
          score: numericScore,
        },
        createdBy: teacherId,
      });
    } catch (err) {
      req.log?.warn({ err }, 'exam grade notification failed');
    }
    res.status(200).json(ok(grade, 'تم تقييم الامتحان'));
  }
}
