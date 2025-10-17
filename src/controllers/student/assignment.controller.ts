import { Request, Response } from 'express';
import path from 'path';
import { AcademicYearModel } from '../../models/academic-year.model';
import { AssignmentModel } from '../../models/assignment.model';
import { AssignmentService } from '../../services/assignment.service';
import { NotificationService } from '../../services/notification.service';
import { saveBase64File } from '../../utils/file.util';

export class StudentAssignmentController {
  static getService(): AssignmentService {
    return new AssignmentService();
  }

  // GET /api/student/assignments
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const page = parseInt(String((req.query as any)['page'] ?? '1'), 10);
      const limit = parseInt(String((req.query as any)['limit'] ?? '20'), 10);
      const service = StudentAssignmentController.getService();
      const activeYear = await AcademicYearModel.getActive();
      const studyYear = activeYear?.year ?? null;
      const result = await service.listForStudent(String(me.id), page, limit, studyYear);
      res.status(200).json({ success: true, data: result.data, pagination: { page, limit, total: result.total } });
    } catch (error) {
      console.error('Error listing student assignments:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // GET /api/student/assignments/:id
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params['id']);
      const service = StudentAssignmentController.getService();
      const item = await service.getById(id);
      if (!item) { res.status(404).json({ success: false, message: 'غير موجود' }); return; }

      // Enforce active study year
      const activeYear = await AcademicYearModel.getActive();
      const active = activeYear?.year ?? null;
      if (active && item.study_year && String(item.study_year) !== String(active)) {
        res.status(404).json({ success: false, message: 'هذا الواجب غير متوفر لك' });
        return;
      }

      // Visibility checks for specific_students
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      if (item.visibility === 'specific_students') {
        const recipients = await AssignmentModel.getRecipientIds(item.id);
        if (!recipients.includes(String(me.id))) {
          res.status(404).json({ success: false, message: 'هذا الواجب غير متوفر لك' });
          return;
        }
      }
      // Include student's submission (score/feedback/status) if exists
      const submission = await AssignmentModel.getSubmission(item.id, String(me.id));
      const mySubmission = submission
        ? { score: submission.score ?? null, feedback: submission.feedback ?? null, status: submission.status }
        : null;
      // Expose delivery_mode for frontend convenience
      const delivery_mode = (item as any)?.attachments?.meta?.delivery_mode ?? 'mixed';
      const dataWithDelivery = { ...item, delivery_mode } as any;
      res.status(200).json({ success: true, data: dataWithDelivery, mySubmission });
    } catch (error) {
      console.error('Error get assignment:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // GET /api/student/assignments/:id/submission (current student's submission)
  static async mySubmission(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const assignmentId = String(req.params['id']);
      // IMPORTANT: Do NOT call submit() here; it would overwrite existing data with empty fields.
      // Simply return the current submission if it exists.
      const sub = await AssignmentModel.getSubmission(assignmentId, String(me.id));
      res.status(200).json({ success: true, data: sub });
    } catch (error) {
      console.error('Error get my submission:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // POST /api/student/assignments/:id/submit
  static async submit(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const assignmentId = String(req.params['id']);
      const { content_text, link_url, attachments, status } = req.body || {};

      // Fetch assignment and enforce visibility/active-year/window rules
      const service = StudentAssignmentController.getService();
      const assignment = await service.getById(assignmentId);
      if (!assignment) {
        res.status(404).json({ success: false, message: 'الواجب غير موجود' });
        return;
      }

      // Active study year enforcement
      const activeYear = await AcademicYearModel.getActive();
      const active = activeYear?.year ?? null;
      if (active && assignment.study_year && String(assignment.study_year) !== String(active)) {
        res.status(403).json({ success: false, message: 'الواجب ليس ضمن السنة الدراسية المفعلة' });
        return;
      }

      // Must be active
      if (assignment.is_active === false) {
        res.status(403).json({ success: false, message: 'الواجب غير مفعّل' });
        return;
      }

      // Visibility check
      if (assignment.visibility === 'specific_students') {
        const recipients = await AssignmentModel.getRecipientIds(assignment.id);
        if (!recipients.includes(String(me.id))) {
          res.status(403).json({ success: false, message: 'غير مصرح لك بتسليم هذا الواجب' });
          return;
        }
      }

      // Date window checks
      const now = new Date();
      if (assignment.assigned_date) {
        const start = new Date(assignment.assigned_date);
        if (now < start) {
          res.status(400).json({ success: false, message: 'لم يبدأ وقت التسليم بعد' });
          return;
        }
      }
      if (assignment.due_date) {
        const due = new Date(assignment.due_date);
        if (now > due) {
          res.status(400).json({ success: false, message: 'انتهى وقت التسليم' });
          return;
        }
      }

      // Block edits if already graded
      const existingSub = await AssignmentModel.getSubmission(assignmentId, String(me.id));
      if (existingSub && String(existingSub.status) === 'graded') {
        res.status(409).json({ success: false, message: 'تم تقييم الواجب، لا يمكن تعديل التسليم' });
        return;
      }

      // submission_type validation
      const submissionType = String(assignment.submission_type || 'mixed');
      const hasText = typeof content_text === 'string' && content_text.trim().length > 0;
      const hasLink = typeof link_url === 'string' && link_url.trim().length > 0;
      const hasFiles = Array.isArray(attachments) && attachments.length > 0;
      const requireText = submissionType === 'text';
      const requireLink = submissionType === 'link';
      const requireFile = submissionType === 'file';
      // Treat 'electronic' same as 'mixed'
      const isMixed = submissionType === 'mixed' || submissionType === 'electronic';
      if (requireText && !hasText) {
        res.status(400).json({ success: false, message: 'نوع الواجب نصي ويجب إرسال content_text' });
        return;
      }
      if (requireLink && !hasLink) {
        res.status(400).json({ success: false, message: 'نوع الواجب رابط ويجب إرسال link_url' });
        return;
      }
      if (requireFile && !hasFiles) {
        res.status(400).json({ success: false, message: 'نوع الواجب ملفات ويجب إرسال attachments' });
        return;
      }
      if (!isMixed && !requireText && !requireLink && !requireFile && !hasText && !hasLink && !hasFiles) {
        res.status(400).json({ success: false, message: 'لا توجد بيانات تسليم صالحة' });
        return;
      }

      // Process attachments array: convert base64 to files under /uploads/assignments/submissions
      // Normalize attachments: accept either array or { files: [...] }
      const rawFiles = Array.isArray(attachments)
        ? attachments
        : (attachments && Array.isArray(attachments.files))
          ? attachments.files
          : [];
      let processedAttachments = rawFiles;
      try {
        const baseDir = path.join(process.cwd(), 'public', 'uploads', 'assignments', 'submissions');
        if (Array.isArray(rawFiles)) {
          const files: any[] = [];
          for (const f of rawFiles) {
            if (f && typeof f === 'object' && typeof f.base64 === 'string' && f.base64.length > 0) {
              const savedPath = await saveBase64File(f.base64, baseDir, f.name);
              const filename = path.basename(savedPath);
              files.push({
                type: f.type ?? 'file',
                name: f.name ?? filename,
                url: `/uploads/assignments/submissions/${filename}`,
                size: f.size ?? undefined,
              });
            } else {
              files.push(f);
            }
          }
          processedAttachments = files;
        }
      } catch (e) {
        console.error('Error processing student submission attachments:', e);
        // proceed without transforming if saving failed
      }

      // Sanitize status to allowed values (student cannot set 'graded')
      const allowed: Record<string, true> = { submitted: true, late: true, returned: true };
      let finalStatus: 'submitted' | 'late' | 'returned' = 'submitted';
      if (typeof status === 'string') {
        const s = String(status).toLowerCase();
        if (allowed[s]) {
          finalStatus = s as any;
        }
      }

      const saved = await service.submit(assignmentId, String(me.id), {
        content_text: content_text ?? null,
        link_url: link_url ?? null,
        attachments: processedAttachments,
        status: finalStatus,
        submitted_at: new Date().toISOString(),
      });
      // Notify assignment teacher about new submission
      try {
        const notif = req.app.get('notificationService') as NotificationService;
        await notif.createAndSendNotification({
          title: 'تسليم واجب جديد',
          message: `قام الطالب بإرسال واجبه: ${assignment.title}`,
          type: 'assignment_due' as any,
          priority: 'medium',
          recipientType: 'specific_teachers' as any,
          recipientIds: [String(assignment.teacher_id)],
          data: { assignmentId: assignment.id, studentId: String(me.id), subType: 'homework' },
          createdBy: String(me.id),
        });
      } catch (e) {
        console.error('Error sending teacher notification for new submission:', e);
      }
      res.status(200).json({ success: true, data: saved });
    } catch (error) {
      console.error('Error submit assignment:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }
}
