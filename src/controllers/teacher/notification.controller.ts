import { Request, Response } from 'express';
import pool from '@/config/database';
import { NotificationType } from '@/models/notification.model';

export class TeacherNotificationController {
  // GET /api/teacher/notifications
  // query: page, limit, q, type, courseId
  static async listMyNotifications(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) {
        res.status(401).json({ success: false, message: 'غير مصادق', errors: ['المستخدم غير مصادق عليه'] });
        return;
      }

      const page = parseInt(String(req.query['page'] ?? '1'), 10);
      const limit = parseInt(String(req.query['limit'] ?? '20'), 10);
      const q = (req.query['q'] as string | undefined) ?? null;
      const typeRaw = (req.query['type'] as string | undefined) ?? null;
      const courseId = (req.query['courseId'] as string | undefined) ?? null;

      const type = typeRaw && Object.values(NotificationType).includes(typeRaw as NotificationType)
        ? (typeRaw as NotificationType)
        : null;

      // Build SQL to get notifications:
      // - recipient_type IN ('all','teachers') OR teacher specifically targeted
      // - OR related to teacher via data.teacherId / data.teacher_id
      const teacherId = String(me.id);
      const values: any[] = [teacherId];
      let param = 2;
      let where = `(
        n.recipient_type = 'all' OR
        n.recipient_type = 'teachers' OR
        (n.recipient_type = 'specific_teachers' AND $1 = ANY(SELECT jsonb_array_elements_text(n.recipient_ids::jsonb)::uuid)) OR
        (n.data->>'teacherId') = $1::text OR
        (n.data->>'teacher_id') = $1::text
      )
      AND n.status IN ('sent','delivered','read')`;

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

      const total = parseInt((await pool.query(countQuery, values)).rows[0].count);
      const rows = (await pool.query(dataQuery, [...values, limit, (page - 1) * limit])).rows;

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
            : (typeof n?.recipient_ids === 'string'
              ? (() => { try { return JSON.parse(n.recipient_ids); } catch { return []; } })()
              : []),
        };
        return { ...n, sender, recipients };
      });

      res.status(200).json({
        success: true,
        message: 'تم جلب إشعارات المعلم',
        data: withSender,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      console.error('Error listing teacher notifications:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
    }
  }
}
