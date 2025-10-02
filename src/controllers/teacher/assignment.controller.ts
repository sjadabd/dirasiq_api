import { AssignmentModel } from '@/models/assignment.model';
import { UserModel } from '@/models/user.model';
import { NotificationModel } from '@/models/notification.model';
import { AssignmentService } from '@/services/assignment.service';
import { NotificationService } from '@/services/notification.service';
import { saveBase64File } from '@/utils/file.util';
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { AcademicYearModel } from '../../models/academic-year.model';

export class TeacherAssignmentController {
  static getService(): AssignmentService {
    return new AssignmentService();
  }

  // GET /api/teacher/assignments/:id/recipients
  static async recipients(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const id = String(req.params['id']);
      // ensure assignment exists and belongs to this teacher
      const service = TeacherAssignmentController.getService();
      const item = await service.getById(id);
      if (!item) { res.status(404).json({ success: false, message: 'غير موجود' }); return; }
      if (String(item.teacher_id) !== String(me.id)) { res.status(403).json({ success: false, message: 'غير مصرح' }); return; }
      const recipientIds = await AssignmentModel.getRecipientIds(id);
      const recipients: { id: string; name: string }[] = [];
      for (const rid of recipientIds) {
        const u = await UserModel.findById(rid);
        if (u) recipients.push({ id: String(u.id), name: String((u as any).name || '') });
      }
      res.status(200).json({ success: true, data: recipients });
    } catch (error) {
      console.error('Error list recipients:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // GET /api/teacher/assignments/:assignmentId/submission/:studentId
  static async getStudentSubmission(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) { res.status(401).json({ success: false, message: 'غير مصادق' }); return; }
      const assignmentId = String(req.params['assignmentId']);
      const studentId = String(req.params['studentId']);
      // ensure assignment exists and belongs to this teacher
      const service = TeacherAssignmentController.getService();
      const item = await service.getById(assignmentId);
      if (!item) { res.status(404).json({ success: false, message: 'غير موجود' }); return; }
      if (String(item.teacher_id) !== String(me.id)) { res.status(403).json({ success: false, message: 'غير مصرح' }); return; }
      const sub = await AssignmentModel.getSubmission(assignmentId, studentId);
      res.status(200).json({ success: true, data: sub });
    } catch (error) {
      console.error('Error get student submission:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // POST /api/teacher/assignments
  static async create(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) {
        res.status(401).json({ success: false, message: 'غير مصادق' });
        return;
      }

      const {
        course_id,
        subject_id,
        session_id,
        title,
        description,
        assigned_date,
        due_date,
        submission_type,
        attachments,
        resources,
        max_score,
        is_active,
        visibility,
        study_year,
        grade_id,
        recipients, // { studentIds: string[] }
      } = req.body || {};

      if (!course_id || !title) {
        res
          .status(400)
          .json({ success: false, message: 'course_id و title مطلوبة' });
        return;
      }

      // Process attachments: save any base64 files to /public/uploads/assignments and replace with URL
      let processedAttachments = attachments ?? {};
      try {
        const baseDir = path.join(
          process.cwd(),
          'public',
          'uploads',
          'assignments'
        );
        if (attachments && Array.isArray(attachments.files)) {
          const files = [] as any[];
          for (const f of attachments.files) {
            if (
              f &&
              typeof f === 'object' &&
              typeof f.base64 === 'string' &&
              f.base64.length > 0
            ) {
              const savedPath = await saveBase64File(f.base64, baseDir, f.name);
              const filename = path.basename(savedPath);
              files.push({
                type: f.type ?? 'file',
                name: f.name ?? filename,
                url: `/uploads/assignments/${filename}`,
                size: f.size ?? undefined,
              });
            } else {
              files.push(f);
            }
          }
          processedAttachments = { ...attachments, files };
        }
      } catch (e) {
        console.error('Error processing assignment attachments:', e);
        // proceed without transforming if saving failed; you can choose to throw if required
      }

      // Resolve study year: prefer provided value, else use active academic year
      const activeYear = await AcademicYearModel.getActive();
      const resolvedStudyYear = study_year ?? activeYear?.year ?? null;

      const service = TeacherAssignmentController.getService();
      const assignment = await service.createAssignment({
        course_id: String(course_id),
        subject_id: subject_id ? String(subject_id) : null,
        session_id: session_id ? String(session_id) : null,
        teacher_id: String(me.id),
        title: String(title),
        description: description ? String(description) : null,
        assigned_date: assigned_date ?? null,
        due_date: due_date ?? null,
        submission_type: submission_type ?? 'mixed',
        attachments: processedAttachments,
        resources: resources ?? [],
        max_score: max_score ?? 100,
        is_active: typeof is_active === 'boolean' ? is_active : true,
        visibility: visibility ?? 'all_students',
        study_year: resolvedStudyYear,
        grade_id: grade_id ?? null,
        created_by: String(me.id),
      });

      // Set recipients if provided and visibility specific_students
      if (
        assignment.visibility === 'specific_students' &&
        recipients?.studentIds?.length
      ) {
        await service.setRecipients(
          assignment.id,
          recipients.studentIds.map((s: any) => String(s))
        );
      }

      // Send notifications (basic)
      const notif = req.app.get('notificationService') as NotificationService;
      const baseMsg = `تم إنشاء واجب جديد: ${assignment.title}`;
      if (assignment.visibility === 'all_students') {
        await notif.createAndSendNotification({
          title: 'واجب جديد',
          message: baseMsg,
          type: 'assignment_due' as any,
          priority: 'medium',
          recipientType: 'students' as any,
          data: {
            assignmentId: assignment.id,
            dueDate: assignment.due_date,
            subType: 'homework',
          },
          createdBy: String(me.id),
        });
      } else if (
        assignment.visibility === 'specific_students' &&
        recipients?.studentIds?.length
      ) {
        await notif.createAndSendNotification({
          title: 'واجب جديد',
          message: baseMsg,
          type: 'assignment_due' as any,
          priority: 'medium',
          recipientType: 'specific_students' as any,
          recipientIds: recipients.studentIds.map((s: any) => String(s)),
          data: {
            assignmentId: assignment.id,
            dueDate: assignment.due_date,
            subType: 'homework',
          },
          createdBy: String(me.id),
        });
      }

      res.status(201).json({ success: true, data: assignment });
    } catch (error) {
      console.error('Error creating assignment:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // GET /api/teacher/assignments
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) {
        res.status(401).json({ success: false, message: 'غير مصادق' });
        return;
      }
      const page = parseInt(String((req.query as any)['page'] ?? '1'), 10);
      const limit = parseInt(String((req.query as any)['limit'] ?? '20'), 10);
      const service = TeacherAssignmentController.getService();
      // filter by active study year
      const activeYear = await AcademicYearModel.getActive();
      const studyYear = activeYear?.year ?? null;
      const result = await service.listByTeacher(String(me.id), page, limit, studyYear);
      res
        .status(200)
        .json({
          success: true,
          data: result.data,
          pagination: { page, limit, total: result.total },
        });
    } catch (error) {
      console.error('Error listing assignments:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // GET /api/teacher/assignments/:id
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params['id']);
      const service = TeacherAssignmentController.getService();
      const item = await service.getById(id);
      if (!item) {
        res.status(404).json({ success: false, message: 'غير موجود' });
        return;
      }
      res.status(200).json({ success: true, data: item });
    } catch (error) {
      console.error('Error get assignment:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // PATCH /api/teacher/assignments/:id
  static async update(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params['id']);
      const service = TeacherAssignmentController.getService();

      // Load existing to know old attachments for cleanup rules
      const existing = await service.getById(id);
      if (!existing) {
        res.status(404).json({ success: false, message: 'غير موجود' });
        return;
      }

      const body = req.body || {};
      let processedAttachments = body.attachments;

      // If attachments provided, process base64 and compute deletions
      if (body.attachments && Array.isArray(body.attachments.files)) {
        const baseDir = path.join(
          process.cwd(),
          'public',
          'uploads',
          'assignments'
        );
        const incomingFiles = body.attachments.files as any[];

        const keptUrls = new Set<string>();
        const newFiles: any[] = [];

        // Build newFiles: convert base64 -> saved URL, keep URL entries as is and track kept URLs
        for (const f of incomingFiles) {
          if (
            f &&
            typeof f === 'object' &&
            typeof f.base64 === 'string' &&
            f.base64.length > 0
          ) {
            const savedPath = await saveBase64File(f.base64, baseDir, f.name);
            const filename = path.basename(savedPath);
            newFiles.push({
              type: f.type ?? 'file',
              name: f.name ?? filename,
              url: `/uploads/assignments/${filename}`,
              size: f.size ?? undefined,
            });
          } else if (f && typeof f.url === 'string') {
            newFiles.push(f);
            keptUrls.add(f.url);
          } else {
            newFiles.push(f);
          }
        }

        // Delete old files that are not kept by URL
        const oldFiles: any[] =
          existing.attachments && Array.isArray(existing.attachments.files)
            ? existing.attachments.files
            : [];
        for (const ofile of oldFiles) {
          const url: string | undefined = ofile?.url;
          if (
            url &&
            url.startsWith('/uploads/assignments/') &&
            !keptUrls.has(url)
          ) {
            try {
              const abs = path.join(process.cwd(), 'public', url);
              if (fs.existsSync(abs)) {
                fs.unlinkSync(abs);
              }
            } catch (e) {
              console.error('Failed to delete old assignment file:', url, e);
            }
          }
        }

        processedAttachments = { ...body.attachments, files: newFiles };
      }

      const updated = await service.update(id, {
        ...body,
        ...(processedAttachments !== undefined
          ? { attachments: processedAttachments }
          : {}),
      });
      if (!updated) {
        res.status(404).json({ success: false, message: 'غير موجود' });
        return;
      }

      // Notify students about assignment update
      try {
        const notif = req.app.get('notificationService') as NotificationService;
        const baseMsg = `تم تعديل الواجب: ${updated.title}`;
        if (updated.visibility === 'all_students') {
          await notif.createAndSendNotification({
            title: 'تحديث واجب',
            message: baseMsg,
            type: 'assignment_due' as any,
            priority: 'medium',
            recipientType: 'students' as any,
            data: {
              assignmentId: updated.id,
              dueDate: updated.due_date,
              subType: 'homework',
            },
            createdBy: String(existing?.teacher_id ?? ''),
          });
        } else if (updated.visibility === 'specific_students') {
          const recipientIds = await AssignmentModel.getRecipientIds(
            updated.id
          );
          if (recipientIds.length) {
            await notif.createAndSendNotification({
              title: 'تحديث واجب',
              message: baseMsg,
              type: 'assignment_due' as any,
              priority: 'medium',
              recipientType: 'specific_students' as any,
              recipientIds,
              data: {
                assignmentId: updated.id,
                dueDate: updated.due_date,
                subType: 'homework',
              },
              createdBy: String(existing?.teacher_id ?? ''),
            });
          }
        }
      } catch (e) {
        console.error('Error sending assignment update notification:', e);
      }
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      console.error('Error update assignment:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // DELETE /api/teacher/assignments/:id
  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params['id']);
      const service = TeacherAssignmentController.getService();
      const ok = await service.softDelete(id);
      if (!ok) {
        res.status(404).json({ success: false, message: 'غير موجود' });
        return;
      }
      // Soft-delete related notifications to avoid stale items in user inbox
      try {
        const affected = await NotificationModel.softDeleteByAssignmentId(id);
        if (affected > 0) {
          console.info(
            `Notifications soft-deleted for assignment ${id}: ${affected}`
          );
        }
      } catch (e) {
        console.error(
          'Error soft-deleting notifications for assignment:',
          id,
          e
        );
      }
      res.status(200).json({ success: true, message: 'تم الحذف' });
    } catch (error) {
      console.error('Error delete assignment:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // PUT /api/teacher/assignments/:id/recipients
  static async setRecipients(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params['id']);
      const { studentIds } = req.body || {};
      if (!Array.isArray(studentIds)) {
        res.status(400).json({ success: false, message: 'studentIds[] مطلوب' });
        return;
      }
      const service = TeacherAssignmentController.getService();
      const existing = await service.getById(id);
      if (!existing) {
        res.status(404).json({ success: false, message: 'غير موجود' });
        return;
      }

      const ids = studentIds.map((s: any) => String(s));

      if (ids.length === 0) {
        // Safe default: make visibility specific_students with empty recipients → hidden from all students
        if (existing.visibility !== 'specific_students') {
          await service.update(id, { visibility: 'specific_students' as any });
        }
        // Compute removed recipients to notify
        const oldRecipientIds = await AssignmentModel.getRecipientIds(id);
        await service.setRecipients(id, []);
        // Notify removed students that the assignment was revoked
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
        } catch (e) {
          console.error('Error notifying removed recipients on empty set:', e);
        }
        res.status(200).json({ success: true, message: 'تم تفريغ المستلمين وتحويل الرؤية إلى طلاب محددين (مخفي للجميع)' });
        return;
      }

      // Non-empty: ensure visibility is specific_students then set recipients
      if (existing.visibility !== 'specific_students') {
        await service.update(id, { visibility: 'specific_students' as any });
      }
      // Compute added/removed sets
      const oldRecipientIds = await AssignmentModel.getRecipientIds(id);
      const newSet = new Set(ids);
      const oldSet = new Set(oldRecipientIds);
      const added: string[] = ids.filter((x) => !oldSet.has(x));
      const removed: string[] = oldRecipientIds.filter((x) => !newSet.has(x));

      await service.setRecipients(id, ids);

      // Send notifications
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
      } catch (e) {
        console.error('Error sending recipient change notifications:', e);
      }
      res.status(200).json({ success: true, message: 'تم تحديث قائمة المستلمين (طلاب محددين)' });
    } catch (error) {
      console.error('Error set recipients:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }

  // PUT /api/teacher/assignments/:assignmentId/grade/:studentId
  static async grade(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) {
        res.status(401).json({ success: false, message: 'غير مصادق' });
        return;
      }
      const assignmentId = String(req.params['assignmentId']);
      const studentId = String(req.params['studentId']);
      const { score, feedback } = req.body || {};
      const service = TeacherAssignmentController.getService();
      const updated = await service.grade(
        assignmentId,
        studentId,
        Number(score),
        String(me.id),
        feedback
      );

      // Notify student of grade
      if (updated) {
        const notif = req.app.get('notificationService') as NotificationService;
        await notif.createAndSendNotification({
          title: 'نتيجة واجبك',
          message: `تم تقييم واجبك. الدرجة: ${updated.score ?? ''}`,
          type: 'assignment_due' as any,
          priority: 'medium',
          recipientType: 'specific_students' as any,
          recipientIds: [studentId],
          data: { assignmentId, subType: 'homework' },
          createdBy: String(me.id),
        });
      }

      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      console.error('Error grade submission:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
    }
  }
}
