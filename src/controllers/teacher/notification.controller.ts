import { Request, Response } from 'express';
import path from 'path';
import pool from '../../config/database';
import { AcademicYearModel } from '../../models/academic-year.model';
import { NotificationType } from '../../models/notification.model';
import { NotificationService } from '../../services/notification.service';
import {
  saveBase64File,
  saveMultipleBase64Images,
} from '../../utils/file.util';

export class TeacherNotificationController {
  // GET /api/teacher/notifications
  // query: page, limit, q, type, courseId
  static async listMyNotifications(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) {
        res.status(401).json({
          success: false,
          message: 'غير مصادق',
          errors: ['المستخدم غير مصادق عليه'],
        });
        return;
      }
      const page = parseInt(String(req.query['page'] ?? '1'), 10);
      const limit = parseInt(String(req.query['limit'] ?? '20'), 10);
      const q = (req.query['q'] as string | undefined) ?? null;
      const typeRaw = (req.query['type'] as string | undefined) ?? null;
      const courseId = (req.query['courseId'] as string | undefined) ?? null;
      const subType =
        (req.query['subType'] as string | undefined)?.trim() || null;

      const type =
        typeRaw &&
        Object.values(NotificationType).includes(typeRaw as NotificationType)
          ? (typeRaw as NotificationType)
          : null;

      // Build SQL to get notifications:
      // - recipient_type IN ('all','teachers') OR teacher specifically targeted
      // - OR related to teacher via data.teacherId / data.teacher_id
      const teacherId = String(me.id);
      const activeYear = await AcademicYearModel.getActive();
      const values: any[] = [teacherId];
      let param = 2;
      let where = `(
        n.recipient_type = 'all' OR
        n.recipient_type = 'teachers' OR
        (n.recipient_type = 'specific_teachers' AND $1 = ANY(SELECT jsonb_array_elements_text(n.recipient_ids::jsonb)::uuid)) OR
        (n.data->>'teacherId') = $1::text OR
        (n.data->>'teacher_id') = $1::text
      )
      AND n.status IN ('sent','delivered','read')
      AND n.deleted_at IS NULL`;

      if (type) {
        where += ` AND n.type = $${param}`;
        values.push(type);
        param++;
      }
      if (courseId) {
        where += ` AND (n.data->>'courseId') = $${param}::text`;
        values.push(String(courseId));
        param++;
      }
      if (activeYear?.year) {
        where += ` AND n.study_year = $${param}::text`;
        values.push(String(activeYear.year));
        param++;
      }
      if (subType) {
        where += ` AND (n.data->>'subType') = $${param}::text`;
        values.push(String(subType));
        param++;
      }
      if (q && q.trim() !== '') {
        where += ` AND (n.title ILIKE $${param} OR n.message ILIKE $${param})`;
        values.push(`%${q.trim()}%`);
        param++;
      }

      const countQuery = `SELECT COUNT(*) FROM notifications n WHERE ${where}`;
      const dataQuery = `
        SELECT n.*,
               un.read_at AS user_read_at,
               CASE WHEN un.read_at IS NOT NULL THEN true ELSE false END AS is_read
        FROM notifications n
        LEFT JOIN user_notifications un ON un.notification_id = n.id AND un.user_id = $1
        WHERE ${where}
        ORDER BY n.created_at DESC
        LIMIT $${param} OFFSET $${param + 1}
      `;

      const total = parseInt(
        (await pool.query(countQuery, values)).rows[0].count
      );
      const rows = (
        await pool.query(dataQuery, [...values, limit, (page - 1) * limit])
      ).rows;

      const withSender = rows.map((n: any) => {
        const sender = n?.data?.sender || {
          id: n?.created_by,
          type: 'system',
          name: 'النظام',
        };
        const recipients = {
          type: n?.recipient_type,
          ids: Array.isArray(n?.recipient_ids)
            ? n.recipient_ids
            : typeof n?.recipient_ids === 'string'
              ? (() => {
                  try {
                    return JSON.parse(n.recipient_ids);
                  } catch {
                    return [];
                  }
                })()
              : [],
        };
        return { ...n, sender, recipients };
      });

      res.status(200).json({
        success: true,
        message: 'تم جلب إشعارات المعلم',
        data: withSender,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('Error listing teacher notifications:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }

  static async listMyUnreadNotifications(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const me = req.user;
      if (!me) {
        res.status(401).json({
          success: false,
          message: 'غير مصادق',
          errors: ['المستخدم غير مصادق عليه'],
        });
        return;
      }

      const limit = parseInt(String(req.query['limit'] ?? '20'), 10);
      const teacherId = String(me.id);
      const activeYear = await AcademicYearModel.getActive();
      const values: any[] = [teacherId];
      let param = 2;

      let where = `(
        n.recipient_type = 'all' OR
        n.recipient_type = 'teachers' OR
        (n.recipient_type = 'specific_teachers' AND $1 = ANY(SELECT jsonb_array_elements_text(n.recipient_ids::jsonb)::uuid)) OR
        (n.data->>'teacherId') = $1::text OR
        (n.data->>'teacher_id') = $1::text
      )
      AND n.status IN ('sent','delivered','read')
      AND n.deleted_at IS NULL`;

      if (activeYear?.year) {
        where += ` AND n.study_year = $${param}::text`;
        values.push(String(activeYear.year));
        param++;
      }

      const countQuery = `
        SELECT COUNT(*)
        FROM notifications n
        LEFT JOIN user_notifications un ON un.notification_id = n.id AND un.user_id = $1
        WHERE ${where} AND un.read_at IS NULL
      `;
      const dataQuery = `
        SELECT n.*,
               un.read_at AS user_read_at,
               CASE WHEN un.read_at IS NOT NULL THEN true ELSE false END AS is_read
        FROM notifications n
        LEFT JOIN user_notifications un ON un.notification_id = n.id AND un.user_id = $1
        WHERE ${where} AND un.read_at IS NULL
        ORDER BY n.created_at DESC
        LIMIT $${param} OFFSET 0
      `;

      const total = parseInt(
        (await pool.query(countQuery, values)).rows[0].count
      );
      const rows = (await pool.query(dataQuery, [...values, limit])).rows;

      const withSender = rows.map((n: any) => {
        const sender = n?.data?.sender || {
          id: n?.created_by,
          type: 'system',
          name: 'النظام',
        };
        const recipients = {
          type: n?.recipient_type,
          ids: Array.isArray(n?.recipient_ids)
            ? n.recipient_ids
            : typeof n?.recipient_ids === 'string'
              ? (() => {
                  try {
                    return JSON.parse(n.recipient_ids);
                  } catch {
                    return [];
                  }
                })()
              : [],
        };
        return { ...n, sender, recipients };
      });

      res.status(200).json({
        success: true,
        message: 'تم جلب الإشعارات غير المقروءة للمعلم',
        data: withSender,
        pagination: {
          page: 1,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('Error listing teacher unread notifications:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }

  // POST /api/teacher/notifications
  static async createNotification(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) {
        res.status(401).json({
          success: false,
          message: 'غير مصادق',
          errors: ['المستخدم غير مصادق عليه'],
        });
        return;
      }

      const {
        type,
        subType,
        title,
        message,
        courseId,
        subjectId,
        link,
        recipients,
        attachments,
        priority,
      } = req.body || {};

      if (!type || !title || !message) {
        res.status(400).json({
          success: false,
          message: 'type, title, message حقول مطلوبة',
        });
        return;
      }

      if (!recipients || !recipients.mode) {
        res
          .status(400)
          .json({ success: false, message: 'recipients.mode مطلوب' });
        return;
      }

      // Resolve recipient IDs
      let recipientIds: string[] = [];
      const mode = String(recipients.mode);
      switch (mode) {
        case 'specific_students':
          if (
            !Array.isArray(recipients.studentIds) ||
            recipients.studentIds.length === 0
          ) {
            res.status(400).json({
              success: false,
              message: 'studentIds مطلوب عند specific_students',
            });
            return;
          }
          recipientIds = recipients.studentIds.map((s: any) => String(s));
          break;
        case 'students_of_course':
        case 'students_of_session':
        case 'all_students_of_teacher': {
          // Fetch all unique confirmed students for this teacher
          const q = `
            SELECT DISTINCT u.id::text AS id
            FROM users u
            WHERE u.user_type = 'student' AND u.deleted_at IS NULL AND EXISTS (
              SELECT 1 FROM course_bookings cb
              WHERE cb.student_id = u.id
                AND cb.teacher_id = $1
                AND cb.status = 'confirmed'
                AND cb.is_deleted = false
            )
          `;
          const r = await pool.query(q, [String(me.id)]);
          recipientIds = r.rows.map((row: any) => String(row.id));
          if (recipientIds.length === 0) {
            res.status(400).json({
              success: false,
              message: 'لا يوجد طلاب مرتبطون بك حالياً',
            });
            return;
          }
          break;
        }
        default:
          res
            .status(400)
            .json({ success: false, message: 'recipients.mode غير مدعوم' });
          return;
      }

      // Save attachments if provided
      const data: any = {
        subType: subType || null,
        link: link || null,
        courseId: courseId || null,
        subjectId: subjectId || null,
        recipients: { mode, studentCount: recipientIds.length },
        teacherId: String(me.id),
      };

      // Save under project-root public/uploads/notification so it can be served at /uploads/notification
      const baseDir = path.resolve(
        __dirname,
        '..',
        '..',
        '..',
        'public',
        'uploads',
        'notification'
      );
      const toRelative = (p: string) => {
        const u = p.replace(/\\/g, '/');
        const i = u.lastIndexOf('/public/');
        if (i !== -1) return u.substring(i + '/public/'.length);
        const j = u.indexOf('uploads/');
        return j !== -1 ? u.substring(j) : u;
      };
      if (attachments?.pdfBase64) {
        const pdfPath = await saveBase64File(
          attachments.pdfBase64,
          baseDir,
          'attachment.pdf'
        );
        data.attachments = {
          ...(data.attachments || {}),
          pdfUrl: toRelative(pdfPath),
        };
      }
      if (
        Array.isArray(attachments?.imagesBase64) &&
        attachments.imagesBase64.length > 0
      ) {
        const imagePaths = await saveMultipleBase64Images(
          attachments.imagesBase64,
          baseDir
        );
        data.attachments = {
          ...(data.attachments || {}),
          imageUrls: imagePaths.map(toRelative),
        };
      }

      const service = req.app.get('notificationService') as NotificationService;
      if (!service) {
        res
          .status(500)
          .json({ success: false, message: 'خدمة الإشعارات غير مهيأة' });
        return;
      }

      const notification = await service.createAndSendNotification({
        title: String(title),
        message: String(message),
        type: String(type) as any,
        priority: (priority as any) || 'medium',
        recipientType: 'specific_students' as any,
        recipientIds,
        data,
        createdBy: String(me.id),
      });

      if (!notification) {
        res
          .status(500)
          .json({ success: false, message: 'فشل إنشاء/إرسال الإشعار' });
        return;
      }

      res.status(201).json({
        success: true,
        message: 'تم إرسال الإشعار',
        data: notification,
      });
    } catch (error) {
      console.error('Error creating teacher notification:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }

  // DELETE /api/teacher/notifications/:id (soft delete)
  static async deleteNotification(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) {
        res.status(401).json({
          success: false,
          message: 'غير مصادق',
          errors: ['المستخدم غير مصادق عليه'],
        });
        return;
      }
      const id = String(req.params['id'] || '');
      if (!id) {
        res
          .status(400)
          .json({ success: false, message: 'معرّف الإشعار مطلوب' });
        return;
      }

      // Ensure the teacher owns the notification (created_by)
      const check = await pool.query(
        'SELECT id, created_by FROM notifications WHERE id = $1 AND deleted_at IS NULL',
        [id]
      );
      if (check.rowCount === 0) {
        res.status(404).json({ success: false, message: 'الإشعار غير موجود' });
        return;
      }
      if (String(check.rows[0].created_by) !== String(me.id)) {
        res
          .status(403)
          .json({ success: false, message: 'غير مخوّل لحذف هذا الإشعار' });
        return;
      }

      await pool.query(
        'UPDATE notifications SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW() WHERE id = $1',
        [id, String(me.id)]
      );
      res.status(200).json({ success: true, message: 'تم حذف الإشعار' });
    } catch (error) {
      console.error('Error deleting teacher notification:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }
}
