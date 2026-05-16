import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

import pool from '../../config/database';
import { AcademicYearModel } from '../../models/academic-year.model';
import { AssignmentModel, type SubmissionType } from '../../models/assignment.model';
import { NotificationModel } from '../../models/notification.model';
import { UserModel } from '../../models/user.model';
import { AssignmentService } from '../../services/assignment.service';
import { NotificationService } from '../../services/notification.service';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';
import { saveBase64File } from '../../utils/file.util';

const ASSIGNMENTS_DIR = path.join(process.cwd(), 'public', 'uploads', 'assignments');
const ALLOWED_SUBMISSION_TYPES = new Set<SubmissionType>(['text', 'file', 'link', 'mixed']);

const normalizeSubmissionType = (raw: string | undefined, fallback: SubmissionType): SubmissionType => {
  if (!raw) return fallback;
  const lower = raw.toLowerCase();
  if (['paper', 'online', 'electronic'].includes(lower)) return 'mixed';
  return ALLOWED_SUBMISSION_TYPES.has(lower as SubmissionType)
    ? (lower as SubmissionType)
    : 'mixed';
};

const fetchService = (): AssignmentService => new AssignmentService();

const requireOwnership = async (assignmentId: string, teacherId: string) => {
  const service = fetchService();
  const item = await service.getById(assignmentId);
  if (!item) {
    throw new ApiError(404, 'الواجب غير موجود', ErrorCodes.NOT_FOUND);
  }
  if (String(item.teacher_id) !== teacherId) {
    throw new ApiError(403, 'الوصول مرفوض', ErrorCodes.FORBIDDEN);
  }
  return item;
};

const fetchStudentsBasic = async (ids: string[]): Promise<Array<{ id: string; name: string }>> => {
  const result: Array<{ id: string; name: string }> = [];
  for (const id of ids) {
    const u = await UserModel.findById(id);
    if (u) result.push({ id: String(u.id), name: String((u as any).name || '') });
  }
  return result;
};

export class TeacherAssignmentController {
  // -------------------------------------------------------------------------
  // GET /api/teacher/assignments
  // -------------------------------------------------------------------------
  static async list(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { page, limit } = parsePagination(req.query);
    const activeYear = await AcademicYearModel.getActive();
    const studyYear = activeYear?.year ?? null;
    const service = fetchService();
    const result = await service.listByTeacher(teacherId, page, limit, studyYear);
    res
      .status(200)
      .json(paginated(result.data, buildPaginationMeta(result.total, page, limit), 'تم جلب الواجبات'));
  }

  // -------------------------------------------------------------------------
  // GET /api/teacher/assignments/:id
  // -------------------------------------------------------------------------
  static async getById(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const service = fetchService();
    const item = await service.getById(id);
    if (!item) {
      throw new ApiError(404, 'الواجب غير موجود', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(ok(item, 'تم جلب الواجب'));
  }

  // -------------------------------------------------------------------------
  // GET /api/teacher/assignments/:id/students
  // -------------------------------------------------------------------------
  static async students(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const item = await requireOwnership(id, teacherId);

    if (item.visibility === 'specific_students') {
      const ids = await AssignmentModel.getRecipientIds(id);
      const students = await fetchStudentsBasic(ids);
      res.status(200).json(ok(students, 'الطلاب المستهدفون بالواجب'));
      return;
    }

    const q = `
      SELECT u.id::text AS id, u.name AS name
      FROM course_bookings cb
      JOIN users u ON u.id = cb.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
      WHERE cb.course_id = $1 AND cb.teacher_id = $2 AND cb.status = 'confirmed' AND cb.is_deleted = false
      ORDER BY u.name ASC
    `;
    const rows = (await pool.query(q, [String(item.course_id), teacherId])).rows;
    res.status(200).json(ok(rows, 'الطلاب المستهدفون بالواجب'));
  }

  // -------------------------------------------------------------------------
  // GET /api/teacher/assignments/:id/overview
  // -------------------------------------------------------------------------
  static async overview(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const item = await requireOwnership(id, teacherId);

    let recipients: Array<{ id: string; name: string }> = [];
    if (item.visibility === 'specific_students') {
      const ids = await AssignmentModel.getRecipientIds(id);
      recipients = await fetchStudentsBasic(ids);
    }

    const submissions = await AssignmentModel.listSubmissionsByAssignment(id);
    const studentIds = Array.from(new Set(submissions.map((s: any) => String(s.student_id))));
    const studentMap = new Map<string, { id: string; name: string }>();
    for (const sid of studentIds) {
      const u = await UserModel.findById(sid);
      if (u) studentMap.set(String(u.id), { id: String(u.id), name: String((u as any).name || '') });
    }
    const submissionsWithStudent = submissions.map((s: any) => ({
      ...s,
      student: studentMap.get(String(s.student_id)) || { id: String(s.student_id), name: '' },
    }));

    res
      .status(200)
      .json(ok({ assignment: item, recipients, submissions: submissionsWithStudent }, 'تفاصيل الواجب'));
  }

  // -------------------------------------------------------------------------
  // GET /api/teacher/assignments/:id/recipients
  // -------------------------------------------------------------------------
  static async recipients(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    await requireOwnership(id, teacherId);
    const recipientIds = await AssignmentModel.getRecipientIds(id);
    const recipients = await fetchStudentsBasic(recipientIds);
    res.status(200).json(ok(recipients, 'المستلمون'));
  }

  // -------------------------------------------------------------------------
  // GET /api/teacher/assignments/:assignmentId/submission/:studentId
  // -------------------------------------------------------------------------
  static async getStudentSubmission(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const assignmentId = req.params['assignmentId'] as string;
    const studentId = req.params['studentId'] as string;
    await requireOwnership(assignmentId, teacherId);
    const submission = await AssignmentModel.getSubmission(assignmentId, studentId);
    res.status(200).json(ok(submission, 'تسليم الطالب'));
  }

  // -------------------------------------------------------------------------
  // POST /api/teacher/assignments
  // -------------------------------------------------------------------------
  static async create(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const body = req.body as Record<string, any>;

    const submissionType = normalizeSubmissionType(body['submission_type'], 'mixed');
    const deliveryMode = body['delivery_mode'] ?? (typeof body['submission_type'] === 'string' ? body['submission_type'] : 'mixed');
    const normalizedDelivery = ['paper', 'electronic', 'mixed'].includes(String(deliveryMode).toLowerCase())
      ? String(deliveryMode).toLowerCase()
      : 'mixed';

    let processedAttachments = body['attachments'] ?? {};
    if (body['attachments'] && Array.isArray(body['attachments'].files)) {
      const files: any[] = [];
      for (const f of body['attachments'].files) {
        if (f && typeof f.base64 === 'string' && f.base64.length > 0) {
          const savedPath = await saveBase64File(f.base64, ASSIGNMENTS_DIR, f.name);
          const filename = path.basename(savedPath);
          files.push({
            type: f.type ?? 'file',
            name: f.name ?? filename,
            url: `/uploads/assignments/${filename}`,
            size: f.size,
          });
        } else {
          files.push(f);
        }
      }
      processedAttachments = { ...body['attachments'], files };
    }
    processedAttachments = {
      ...processedAttachments,
      meta: { ...(processedAttachments.meta || {}), delivery_mode: normalizedDelivery },
    };

    const activeYear = await AcademicYearModel.getActive();
    const resolvedStudyYear = body['study_year'] ?? activeYear?.year ?? null;

    const service = fetchService();
    const assignment = await service.createAssignment({
      course_id: String(body['course_id']),
      subject_id: body['subject_id'] ? String(body['subject_id']) : null,
      session_id: body['session_id'] ? String(body['session_id']) : null,
      teacher_id: teacherId,
      title: String(body['title']),
      description: body['description'] ? String(body['description']) : null,
      assigned_date: body['assigned_date'] ?? null,
      due_date: body['due_date'] ?? null,
      submission_type: submissionType,
      attachments: processedAttachments,
      resources: body['resources'] ?? [],
      max_score: body['max_score'] ?? 100,
      is_active: typeof body['is_active'] === 'boolean' ? body['is_active'] : true,
      visibility: body['visibility'] ?? 'all_students',
      study_year: resolvedStudyYear,
      grade_id: body['grade_id'] ?? null,
      created_by: teacherId,
    });

    const recipientStudentIds: string[] = Array.isArray(body['recipients']?.studentIds)
      ? body['recipients'].studentIds.map((s: any) => String(s))
      : [];
    if (assignment.visibility === 'specific_students' && recipientStudentIds.length) {
      await service.setRecipients(assignment.id, recipientStudentIds);
    }

    try {
      const notif = req.app.get('notificationService') as NotificationService;
      const baseMsg = `تم إنشاء واجب جديد: ${assignment.title}`;
      if (assignment.visibility === 'all_students') {
        const qRecipients = `
          SELECT u.id::text AS id
          FROM course_bookings cb
          JOIN users u ON u.id = cb.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
          WHERE cb.course_id = $1 AND cb.teacher_id = $2 AND cb.status = 'confirmed' AND cb.is_deleted = false
        `;
        const r = await pool.query(qRecipients, [String(assignment.course_id), teacherId]);
        const recipientIds = r.rows.map((row: any) => String(row.id));
        if (recipientIds.length) {
          await notif.createAndSendNotification({
            title: 'واجب جديد',
            message: baseMsg,
            type: 'assignment_due' as any,
            priority: 'medium',
            recipientType: 'specific_students' as any,
            recipientIds,
            data: { assignmentId: assignment.id, dueDate: assignment.due_date, subType: 'homework' },
            createdBy: teacherId,
          });
        }
      } else if (assignment.visibility === 'specific_students' && recipientStudentIds.length) {
        await notif.createAndSendNotification({
          title: 'واجب جديد',
          message: baseMsg,
          type: 'assignment_due' as any,
          priority: 'medium',
          recipientType: 'specific_students' as any,
          recipientIds: recipientStudentIds,
          data: { assignmentId: assignment.id, dueDate: assignment.due_date, subType: 'homework' },
          createdBy: teacherId,
        });
      }
    } catch (err) {
      req.log?.warn({ err }, 'assignment create notification failed');
    }

    res.status(201).json(ok(assignment, 'تم إنشاء الواجب'));
  }

  // -------------------------------------------------------------------------
  // PATCH /api/teacher/assignments/:id
  // -------------------------------------------------------------------------
  static async update(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const existing = await requireOwnership(id, teacherId);

    const body = req.body as Record<string, any>;
    let processedAttachments = body['attachments'];

    if (body['attachments'] && Array.isArray(body['attachments'].files)) {
      const incomingFiles = body['attachments'].files as any[];
      const keptUrls = new Set<string>();
      const newFiles: any[] = [];

      for (const f of incomingFiles) {
        if (f && typeof f.base64 === 'string' && f.base64.length > 0) {
          const savedPath = await saveBase64File(f.base64, ASSIGNMENTS_DIR, f.name);
          const filename = path.basename(savedPath);
          newFiles.push({
            type: f.type ?? 'file',
            name: f.name ?? filename,
            url: `/uploads/assignments/${filename}`,
            size: f.size,
          });
        } else if (f && typeof f.url === 'string') {
          newFiles.push(f);
          keptUrls.add(f.url);
        } else {
          newFiles.push(f);
        }
      }

      const oldFiles: any[] =
        existing.attachments && Array.isArray(existing.attachments.files) ? existing.attachments.files : [];
      for (const ofile of oldFiles) {
        const url: string | undefined = ofile?.url;
        if (url && url.startsWith('/uploads/assignments/') && !keptUrls.has(url)) {
          try {
            const abs = path.join(process.cwd(), 'public', url);
            if (fs.existsSync(abs)) fs.unlinkSync(abs);
          } catch (err) {
            req.log?.warn({ err, url }, 'failed to delete old assignment file');
          }
        }
      }
      processedAttachments = { ...body['attachments'], files: newFiles };
    }

    const submissionType = typeof body['submission_type'] === 'string'
      ? normalizeSubmissionType(body['submission_type'], existing.submission_type)
      : undefined;

    const patchPayload = {
      ...body,
      ...(processedAttachments !== undefined ? { attachments: processedAttachments } : {}),
      ...(submissionType ? { submission_type: submissionType } : {}),
    };

    const service = fetchService();
    const updated = await service.update(id, patchPayload as any);
    if (!updated) {
      throw new ApiError(404, 'الواجب غير موجود', ErrorCodes.NOT_FOUND);
    }

    try {
      const notif = req.app.get('notificationService') as NotificationService;
      const baseMsg = `تم تعديل الواجب: ${updated.title}`;
      if (updated.visibility === 'all_students') {
        const r = await pool.query(
          `SELECT u.id::text AS id
             FROM course_bookings cb
             JOIN users u ON u.id = cb.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
            WHERE cb.course_id = $1 AND cb.teacher_id = $2 AND cb.status = 'confirmed' AND cb.is_deleted = false`,
          [String(updated.course_id), teacherId]
        );
        const recipientIds = r.rows.map((row: any) => String(row.id));
        if (recipientIds.length) {
          await notif.createAndSendNotification({
            title: 'تحديث واجب',
            message: baseMsg,
            type: 'assignment_due' as any,
            priority: 'medium',
            recipientType: 'specific_students' as any,
            recipientIds,
            data: { assignmentId: updated.id, dueDate: updated.due_date, subType: 'homework' },
            createdBy: teacherId,
          });
        }
      } else if (updated.visibility === 'specific_students') {
        const recipientIds = await AssignmentModel.getRecipientIds(updated.id);
        if (recipientIds.length) {
          await notif.createAndSendNotification({
            title: 'تحديث واجب',
            message: baseMsg,
            type: 'assignment_due' as any,
            priority: 'medium',
            recipientType: 'specific_students' as any,
            recipientIds,
            data: { assignmentId: updated.id, dueDate: updated.due_date, subType: 'homework' },
            createdBy: teacherId,
          });
        }
      }
    } catch (err) {
      req.log?.warn({ err }, 'assignment update notification failed');
    }

    res.status(200).json(ok(updated, 'تم تحديث الواجب'));
  }

  // -------------------------------------------------------------------------
  // DELETE /api/teacher/assignments/:id
  // -------------------------------------------------------------------------
  static async remove(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const service = fetchService();
    const success = await service.softDelete(id);
    if (!success) {
      throw new ApiError(404, 'الواجب غير موجود', ErrorCodes.NOT_FOUND);
    }
    try {
      await NotificationModel.softDeleteByAssignmentId(id);
    } catch (err) {
      req.log?.warn({ err, id }, 'failed to soft-delete notifications for assignment');
    }
    res.status(200).json(ok(null, 'تم الحذف'));
  }

  // -------------------------------------------------------------------------
  // PUT /api/teacher/assignments/:id/recipients
  // -------------------------------------------------------------------------
  static async setRecipients(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const { studentIds } = req.body as { studentIds: string[] };
    const service = fetchService();
    const existing = await service.getById(id);
    if (!existing) {
      throw new ApiError(404, 'الواجب غير موجود', ErrorCodes.NOT_FOUND);
    }
    const ids = studentIds.map((s) => String(s));

    if (ids.length === 0) {
      if (existing.visibility !== 'specific_students') {
        await service.update(id, { visibility: 'specific_students' as any });
      }
      const oldRecipientIds = await AssignmentModel.getRecipientIds(id);
      await service.setRecipients(id, []);
      try {
        if (oldRecipientIds.length) {
          const notif = req.app.get('notificationService') as NotificationService;
          await notif.createAndSendNotification({
            title: 'إلغاء واجب',
            message: `تم إلغاء الواجب: ${existing.title}`,
            type: 'assignment_due' as any,
            priority: 'medium',
            recipientType: 'specific_students' as any,
            recipientIds: oldRecipientIds,
            data: { assignmentId: existing.id, dueDate: existing.due_date, subType: 'homework' },
            createdBy: String(existing.teacher_id),
          });
        }
      } catch (err) {
        req.log?.warn({ err }, 'recipient removal notification failed');
      }
      res.status(200).json(ok(null, 'تم تفريغ المستلمين وتحويل الرؤية إلى طلاب محددين (مخفي للجميع)'));
      return;
    }

    if (existing.visibility !== 'specific_students') {
      await service.update(id, { visibility: 'specific_students' as any });
    }
    const oldRecipientIds = await AssignmentModel.getRecipientIds(id);
    const newSet = new Set(ids);
    const oldSet = new Set(oldRecipientIds);
    const added = ids.filter((x) => !oldSet.has(x));
    const removed = oldRecipientIds.filter((x) => !newSet.has(x));
    await service.setRecipients(id, ids);

    try {
      const notif = req.app.get('notificationService') as NotificationService;
      if (added.length) {
        await notif.createAndSendNotification({
          title: 'واجب جديد',
          message: `تم تعيين واجب لك: ${existing.title}`,
          type: 'assignment_due' as any,
          priority: 'medium',
          recipientType: 'specific_students' as any,
          recipientIds: added,
          data: { assignmentId: existing.id, dueDate: existing.due_date, subType: 'homework' },
          createdBy: String(existing.teacher_id),
        });
      }
      if (removed.length) {
        await notif.createAndSendNotification({
          title: 'إلغاء واجب',
          message: `تم إلغاء الواجب: ${existing.title}`,
          type: 'assignment_due' as any,
          priority: 'medium',
          recipientType: 'specific_students' as any,
          recipientIds: removed,
          data: { assignmentId: existing.id, dueDate: existing.due_date, subType: 'homework' },
          createdBy: String(existing.teacher_id),
        });
      }
    } catch (err) {
      req.log?.warn({ err }, 'recipient change notification failed');
    }

    res.status(200).json(ok(null, 'تم تحديث قائمة المستلمين (طلاب محددين)'));
  }

  // -------------------------------------------------------------------------
  // PUT /api/teacher/assignments/:assignmentId/grade/:studentId
  // -------------------------------------------------------------------------
  static async grade(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const assignmentId = req.params['assignmentId'] as string;
    const studentId = req.params['studentId'] as string;
    const { score, feedback } = req.body as { score: number; feedback?: string };
    const service = fetchService();
    const updated = await service.grade(assignmentId, studentId, Number(score), teacherId, feedback);

    if (updated) {
      try {
        const notif = req.app.get('notificationService') as NotificationService;
        await notif.createAndSendNotification({
          title: 'نتيجة واجبك',
          message: `تم تقييم واجبك. الدرجة: ${updated.score ?? ''}`,
          type: 'assignment_due' as any,
          priority: 'medium',
          recipientType: 'specific_students' as any,
          recipientIds: [studentId],
          data: { assignmentId, subType: 'homework' },
          createdBy: teacherId,
        });
      } catch (err) {
        req.log?.warn({ err }, 'assignment grade notification failed');
      }
    }
    res.status(200).json(ok(updated, 'تم تقييم الواجب'));
  }
}
