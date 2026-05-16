import type { Request, Response } from 'express';
import path from 'path';

import pool from '../../config/database';
import { AcademicYearModel } from '../../models/academic-year.model';
import { NotificationType } from '../../models/notification.model';
import { NotificationService } from '../../services/notification.service';
import { saveBase64File, saveMultipleBase64Images } from '../../utils/file.util';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';

const NOTIFICATION_UPLOAD_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'public',
  'uploads',
  'notification'
);

const toRelativeUploadPath = (p: string): string => {
  const u = p.replace(/\\/g, '/');
  const i = u.lastIndexOf('/public/');
  if (i !== -1) return u.substring(i + '/public/'.length);
  const j = u.indexOf('uploads/');
  return j !== -1 ? u.substring(j) : u;
};

const enrichWithSender = (n: any) => {
  const sender = n?.data?.sender || {
    id: n?.created_by,
    type: 'system',
    name: 'النظام',
  };
  let recipientIds: any[] = [];
  if (Array.isArray(n?.recipient_ids)) {
    recipientIds = n.recipient_ids;
  } else if (typeof n?.recipient_ids === 'string') {
    try {
      recipientIds = JSON.parse(n.recipient_ids);
    } catch {
      recipientIds = [];
    }
  }
  return { ...n, sender, recipients: { type: n?.recipient_type, ids: recipientIds } };
};

export class TeacherNotificationController {
  // GET /api/teacher/notifications
  static async listMyNotifications(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { page, limit } = parsePagination(req.query);
    const query = req.query as unknown as {
      q?: string;
      type?: string;
      courseId?: string;
      subType?: string;
    };

    const activeYear = await AcademicYearModel.getActive();
    const values: unknown[] = [teacherId];
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

    if (query.type && Object.values(NotificationType).includes(query.type as NotificationType)) {
      where += ` AND n.type = $${param}`;
      values.push(query.type);
      param++;
    }
    if (query.courseId) {
      where += ` AND (n.data->>'courseId') = $${param}::text`;
      values.push(query.courseId);
      param++;
    }
    if (activeYear?.year) {
      where += ` AND n.study_year = $${param}::text`;
      values.push(activeYear.year);
      param++;
    }
    if (query.subType && query.subType.trim() !== '') {
      where += ` AND (n.data->>'subType') = $${param}::text`;
      values.push(query.subType);
      param++;
    }
    if (query.q && query.q.trim() !== '') {
      where += ` AND (n.title ILIKE $${param} OR n.message ILIKE $${param})`;
      values.push(`%${query.q.trim()}%`);
      param++;
    }

    const total = parseInt(
      (await pool.query(`SELECT COUNT(*) FROM notifications n WHERE ${where}`, values)).rows[0].count
    );
    const rows = (
      await pool.query(
        `SELECT n.*,
                un.read_at AS user_read_at,
                CASE WHEN un.read_at IS NOT NULL THEN true ELSE false END AS is_read
           FROM notifications n
           LEFT JOIN user_notifications un ON un.notification_id = n.id AND un.user_id = $1
          WHERE ${where}
          ORDER BY n.created_at DESC
          LIMIT $${param} OFFSET $${param + 1}`,
        [...values, limit, (page - 1) * limit]
      )
    ).rows;

    res
      .status(200)
      .json(
        paginated(rows.map(enrichWithSender), buildPaginationMeta(total, page, limit), 'تم جلب إشعارات المعلم')
      );
  }

  // GET /api/teacher/notifications/unread
  static async listMyUnreadNotifications(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { page, limit } = parsePagination(req.query);
    const activeYear = await AcademicYearModel.getActive();

    const values: unknown[] = [teacherId];
    let param = 2;
    let where = `(
      n.recipient_type = 'all' OR
      n.recipient_type = 'teachers' OR
      (n.recipient_type = 'specific_teachers' AND $1 = ANY(SELECT jsonb_array_elements_text(n.recipient_ids::jsonb)::uuid)) OR
      (n.data->>'teacherId') = $1::text OR
      (n.data->>'teacher_id') = $1::text
    )
    AND n.status IN ('sent','delivered','read','failed')
    AND n.deleted_at IS NULL
    AND (COALESCE(n.data->'sender'->>'type','') = ANY(ARRAY['system','admin']))`;

    if (activeYear?.year) {
      where += ` AND n.study_year = $${param}::text`;
      values.push(activeYear.year);
      param++;
    }

    const total = parseInt(
      (
        await pool.query(
          `SELECT COUNT(*)
             FROM notifications n
             LEFT JOIN user_notifications un ON un.notification_id = n.id AND un.user_id = $1
            WHERE ${where}`,
          values
        )
      ).rows[0].count
    );

    const rows = (
      await pool.query(
        `SELECT n.*,
                un.read_at AS user_read_at,
                CASE WHEN un.read_at IS NOT NULL THEN true ELSE false END AS is_read
           FROM notifications n
           LEFT JOIN user_notifications un ON un.notification_id = n.id AND un.user_id = $1
          WHERE ${where}
          ORDER BY n.created_at DESC
          LIMIT $${param} OFFSET $${param + 1}`,
        [...values, limit, (page - 1) * limit]
      )
    ).rows;

    res
      .status(200)
      .json(
        paginated(
          rows.map(enrichWithSender),
          buildPaginationMeta(total, page, limit),
          'تم جلب إشعارات النظام للمعلم'
        )
      );
  }

  // POST /api/teacher/notifications
  static async createNotification(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const body = req.body as Record<string, any>;

    let recipientIds: string[] = [];
    const mode = String(body['recipients'].mode);
    switch (mode) {
      case 'specific_students': {
        const ids: any[] = body['recipients'].studentIds;
        if (!Array.isArray(ids) || ids.length === 0) {
          throw new ApiError(
            400,
            'studentIds مطلوب عند specific_students',
            ErrorCodes.VALIDATION_ERROR
          );
        }
        recipientIds = ids.map((s) => String(s));
        break;
      }
      case 'students_of_course':
      case 'students_of_session':
      case 'all_students_of_teacher': {
        const r = await pool.query(
          `SELECT DISTINCT u.id::text AS id
             FROM users u
            WHERE u.user_type = 'student' AND u.deleted_at IS NULL AND EXISTS (
              SELECT 1 FROM course_bookings cb
               WHERE cb.student_id = u.id
                 AND cb.teacher_id = $1
                 AND cb.status = 'confirmed'
                 AND cb.is_deleted = false
            )`,
          [teacherId]
        );
        recipientIds = r.rows.map((row: any) => String(row.id));
        if (recipientIds.length === 0) {
          throw new ApiError(
            400,
            'لا يوجد طلاب مرتبطون بك حالياً',
            ErrorCodes.BUSINESS_RULE
          );
        }
        break;
      }
      default:
        throw new ApiError(400, 'recipients.mode غير مدعوم', ErrorCodes.VALIDATION_ERROR);
    }

    const data: Record<string, any> = {
      subType: body['subType'] || null,
      link: body['link'] || null,
      courseId: body['courseId'] || null,
      subjectId: body['subjectId'] || null,
      recipients: { mode, studentCount: recipientIds.length },
      teacherId,
    };

    if (body['attachments']?.pdfBase64) {
      const pdfPath = await saveBase64File(
        body['attachments'].pdfBase64,
        NOTIFICATION_UPLOAD_DIR,
        'attachment.pdf'
      );
      data['attachments'] = { ...(data['attachments'] || {}), pdfUrl: toRelativeUploadPath(pdfPath) };
    }
    if (Array.isArray(body['attachments']?.imagesBase64) && body['attachments'].imagesBase64.length > 0) {
      const imagePaths = await saveMultipleBase64Images(body['attachments'].imagesBase64, NOTIFICATION_UPLOAD_DIR);
      data['attachments'] = {
        ...(data['attachments'] || {}),
        imageUrls: imagePaths.map(toRelativeUploadPath),
      };
    }

    const service = req.app.get('notificationService') as NotificationService;
    if (!service) {
      throw new ApiError(500, 'خدمة الإشعارات غير مهيأة', ErrorCodes.SERVICE_UNAVAILABLE);
    }

    const notification = await service.createAndSendNotification({
      title: String(body['title']),
      message: String(body['message']),
      type: String(body['type']) as any,
      priority: (body['priority'] as any) || 'medium',
      recipientType: 'specific_students' as any,
      recipientIds,
      data,
      createdBy: teacherId,
    });

    if (!notification) {
      throw new ApiError(500, 'فشل إنشاء/إرسال الإشعار', ErrorCodes.INTERNAL_ERROR);
    }

    res.status(201).json(ok(notification, 'تم إرسال الإشعار'));
  }

  // DELETE /api/teacher/notifications/:id
  static async deleteNotification(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;

    const check = await pool.query(
      'SELECT id, created_by FROM notifications WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (check.rowCount === 0) {
      throw new ApiError(404, 'الإشعار غير موجود', ErrorCodes.NOT_FOUND);
    }
    if (String(check.rows[0].created_by) !== teacherId) {
      throw new ApiError(403, 'غير مخوّل لحذف هذا الإشعار', ErrorCodes.FORBIDDEN);
    }
    await pool.query(
      'UPDATE notifications SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW() WHERE id = $1',
      [id, teacherId]
    );
    res.status(200).json(ok(null, 'تم حذف الإشعار'));
  }
}
