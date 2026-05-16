import type { Request, Response } from 'express';
import path from 'path';

import { AcademicYearModel } from '../../models/academic-year.model';
import { AssignmentModel } from '../../models/assignment.model';
import { AssignmentService } from '../../services/assignment.service';
import { NotificationService } from '../../services/notification.service';
import { saveBase64File } from '../../utils/file.util';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';

const SUBMISSIONS_DIR = path.join(
  process.cwd(),
  'public',
  'uploads',
  'assignments',
  'submissions'
);

const getService = (): AssignmentService => new AssignmentService();

export class StudentAssignmentController {
  // GET /api/student/assignments
  static async list(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const { page, limit } = parsePagination(req.query);
    const service = getService();
    const activeYear = await AcademicYearModel.getActive();
    const studyYear = activeYear?.year ?? null;
    const result = await service.listForStudent(studentId, page, limit, studyYear);
    res
      .status(200)
      .json(paginated(result.data, buildPaginationMeta(result.total, page, limit), 'تم جلب الواجبات'));
  }

  // GET /api/student/assignments/:id
  static async getById(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const id = req.params['id'] as string;
    const service = getService();
    const item = await service.getById(id);
    if (!item) {
      throw new ApiError(404, 'الواجب غير موجود', ErrorCodes.NOT_FOUND);
    }

    // Active study year enforcement (404 to hide existence from other-year students).
    const activeYear = await AcademicYearModel.getActive();
    const active = activeYear?.year ?? null;
    if (active && item.study_year && String(item.study_year) !== String(active)) {
      throw new ApiError(404, 'هذا الواجب غير متوفر لك', ErrorCodes.NOT_FOUND);
    }

    if (item.visibility === 'specific_students') {
      const recipients = await AssignmentModel.getRecipientIds(item.id);
      if (!recipients.includes(studentId)) {
        throw new ApiError(404, 'هذا الواجب غير متوفر لك', ErrorCodes.NOT_FOUND);
      }
    }

    const submission = await AssignmentModel.getSubmission(item.id, studentId);
    const mySubmission = submission
      ? { score: submission.score ?? null, feedback: submission.feedback ?? null, status: submission.status }
      : null;
    const delivery_mode = (item as any)?.attachments?.meta?.delivery_mode ?? 'mixed';
    const dataWithDelivery = { ...item, delivery_mode };

    // Legacy contract surfaces `mySubmission` at the top level of the response.
    // Preserve it under `meta` so the canonical envelope stays clean and the
    // dashboard / Flutter still receive it.
    res
      .status(200)
      .json(ok(dataWithDelivery, 'تفاصيل الواجب', { mySubmission }));
  }

  // GET /api/student/assignments/:id/submission
  static async mySubmission(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const assignmentId = req.params['id'] as string;
    // Do NOT call submit() — read-only.
    const sub = await AssignmentModel.getSubmission(assignmentId, studentId);
    res.status(200).json(ok(sub, 'تسليمك للواجب'));
  }

  // POST /api/student/assignments/:id/submit
  static async submit(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const studentName = req.user.name;
    const assignmentId = req.params['id'] as string;
    const { content_text, link_url, attachments, status } = req.body as {
      content_text?: string | null;
      link_url?: string | null;
      attachments?: unknown;
      status?: 'submitted' | 'late' | 'returned';
    };

    const service = getService();
    const assignment = await service.getById(assignmentId);
    if (!assignment) {
      throw new ApiError(404, 'الواجب غير موجود', ErrorCodes.NOT_FOUND);
    }

    const activeYear = await AcademicYearModel.getActive();
    const active = activeYear?.year ?? null;
    if (active && assignment.study_year && String(assignment.study_year) !== String(active)) {
      throw new ApiError(
        403,
        'الواجب ليس ضمن السنة الدراسية المفعلة',
        ErrorCodes.BUSINESS_RULE
      );
    }

    if (assignment.is_active === false) {
      throw new ApiError(403, 'الواجب غير مفعّل', ErrorCodes.BUSINESS_RULE);
    }

    if (assignment.visibility === 'specific_students') {
      const recipients = await AssignmentModel.getRecipientIds(assignment.id);
      if (!recipients.includes(studentId)) {
        throw new ApiError(
          403,
          'غير مصرح لك بتسليم هذا الواجب',
          ErrorCodes.FORBIDDEN
        );
      }
    }

    const now = new Date();
    if (assignment.assigned_date) {
      const start = new Date(assignment.assigned_date);
      if (now < start) {
        throw new ApiError(400, 'لم يبدأ وقت التسليم بعد', ErrorCodes.BUSINESS_RULE);
      }
    }
    if (assignment.due_date) {
      const due = new Date(assignment.due_date);
      if (now > due) {
        throw new ApiError(400, 'انتهى وقت التسليم', ErrorCodes.BUSINESS_RULE);
      }
    }

    const existingSub = await AssignmentModel.getSubmission(assignmentId, studentId);
    if (existingSub && String(existingSub.status) === 'graded') {
      throw new ApiError(
        409,
        'تم تقييم الواجب، لا يمكن تعديل التسليم',
        ErrorCodes.CONFLICT
      );
    }

    const submissionType = String(assignment.submission_type || 'mixed');
    const hasText = typeof content_text === 'string' && content_text.trim().length > 0;
    const hasLink = typeof link_url === 'string' && link_url.trim().length > 0;

    // Normalise attachments: accept either array or `{ files: [...] }`.
    let rawFiles: any[] = [];
    if (Array.isArray(attachments)) {
      rawFiles = attachments;
    } else if (attachments && typeof attachments === 'object' && Array.isArray((attachments as any).files)) {
      rawFiles = (attachments as any).files;
    }
    const hasFiles = rawFiles.length > 0;

    const requireText = submissionType === 'text';
    const requireLink = submissionType === 'link';
    const requireFile = submissionType === 'file';
    const isMixed = submissionType === 'mixed' || submissionType === 'electronic';

    if (requireText && !hasText) {
      throw new ApiError(400, 'نوع الواجب نصي ويجب إرسال content_text', ErrorCodes.VALIDATION_ERROR);
    }
    if (requireLink && !hasLink) {
      throw new ApiError(400, 'نوع الواجب رابط ويجب إرسال link_url', ErrorCodes.VALIDATION_ERROR);
    }
    if (requireFile && !hasFiles) {
      throw new ApiError(400, 'نوع الواجب ملفات ويجب إرسال attachments', ErrorCodes.VALIDATION_ERROR);
    }
    if (!isMixed && !requireText && !requireLink && !requireFile && !hasText && !hasLink && !hasFiles) {
      throw new ApiError(400, 'لا توجد بيانات تسليم صالحة', ErrorCodes.VALIDATION_ERROR);
    }

    // Process attachments: base64 → file under /uploads/assignments/submissions
    let processedAttachments: any[] = rawFiles;
    try {
      const files: any[] = [];
      for (const f of rawFiles) {
        if (f && typeof f === 'object' && typeof f.base64 === 'string' && f.base64.length > 0) {
          const savedPath = await saveBase64File(f.base64, SUBMISSIONS_DIR, f.name);
          const filename = path.basename(savedPath);
          files.push({
            type: f.type ?? 'file',
            name: f.name ?? filename,
            url: `/uploads/assignments/submissions/${filename}`,
            size: f.size,
          });
        } else {
          files.push(f);
        }
      }
      processedAttachments = files;
    } catch (err) {
      req.log?.warn({ err }, 'submission attachment processing failed');
    }

    const finalStatus: 'submitted' | 'late' | 'returned' =
      status && ['submitted', 'late', 'returned'].includes(status) ? status : 'submitted';

    const saved = await service.submit(assignmentId, studentId, {
      content_text: content_text ?? null,
      link_url: link_url ?? null,
      attachments: processedAttachments,
      status: finalStatus,
      submitted_at: new Date().toISOString(),
    });

    try {
      const notif = req.app.get('notificationService') as NotificationService;
      await notif.createAndSendNotification({
        title: 'تسليم واجب جديد',
        message: `قام الطالب ${studentName || ''} بإرسال واجبه: ${assignment.title}`.trim(),
        type: 'assignment_due' as any,
        priority: 'medium',
        recipientType: 'specific_teachers' as any,
        recipientIds: [String(assignment.teacher_id)],
        data: { assignmentId: assignment.id, studentId, subType: 'homework' },
        createdBy: studentId,
      });
    } catch (err) {
      req.log?.warn({ err }, 'assignment submission notification failed');
    }

    res.status(200).json(ok(saved, 'تم تسليم الواجب'));
  }
}
