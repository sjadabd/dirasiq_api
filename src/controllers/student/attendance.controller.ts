import type { Request, Response } from 'express';

import { AttendanceModel } from '../../models/attendance.model';
import {
  NotificationPriority,
  NotificationType,
  RecipientType,
} from '../../models/notification.model';
import { NotificationService } from '../../services/notification.service';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok } from '../../utils/response.util';
import { formatTime12Arabic } from '../../utils/time-format.util';

const notificationService = new NotificationService({
  appId: process.env['ONESIGNAL_APP_ID'] || '',
  restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || '',
});

const to12hFromISO = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const formatted = formatTime12Arabic(iso);
  return formatted || null;
};

export class StudentAttendanceController {
  // POST /api/student/attendance/check-in
  static async checkIn(req: Request, res: Response): Promise<void> {
    const me = req.user;
    const { teacherId } = req.body as { teacherId: string };

    const session = await AttendanceModel.findActiveSessionForTeacherNow(teacherId);
    if (!session) {
      throw new ApiError(
        404,
        'لا توجد محاضرة حالية لهذا المعلم',
        ErrorCodes.NOT_FOUND
      );
    }

    const eligible = await AttendanceModel.isStudentEligibleForSession(
      session.id,
      session.course_id,
      me.id
    );
    if (!eligible) {
      throw new ApiError(
        403,
        'لا تنتمي إلى هذه المحاضرة',
        ErrorCodes.FORBIDDEN
      );
    }

    // Use the Asia/Baghdad calendar date (not UTC) so QR check-in, manual
    // teacher edits, and the auto-absent job all key on the same occurred_on.
    const occurredOnISO = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Baghdad',
    });

    const already = await AttendanceModel.hasCheckedIn(session.id, me.id, occurredOnISO);
    if (already) {
      res
        .status(200)
        .json(
          ok(
            { duplicate: true, sessionId: session.id },
            'تم تسجيل حضورك مسبقاً'
          )
        );
      return;
    }

    const record = await AttendanceModel.checkIn({
      sessionId: session.id,
      courseId: session.course_id,
      teacherId: session.teacher_id,
      studentId: me.id,
      occurredOnISO,
      source: 'qr',
    });

    // Fire-and-forget notifications to student + teacher. Never block on these.
    try {
      const commonData = {
        sessionId: session.id,
        courseId: session.course_id,
        teacherId: session.teacher_id,
        studentId: me.id,
        occurredOn: occurredOnISO,
      };
      const t12 = to12hFromISO(record.checkin_at) || '';

      void notificationService.createAndSendNotification({
        title: 'تأكيد الحضور',
        message: `تم تسجيل حضورك بنجاح للدرس الحالي في الساعة ${t12}`.trim(),
        type: NotificationType.COURSE_UPDATE,
        priority: NotificationPriority.HIGH,
        recipientType: RecipientType.SPECIFIC_STUDENTS,
        recipientIds: [String(me.id)],
        data: { ...commonData, role: 'student' },
        createdBy: String(me.id),
      });

      void notificationService.createAndSendNotification({
        title: 'حضور طالب',
        message: `تم تسجيل حضور الطالب ${me.name ? String(me.name) : ''} إلى الدرس الحالي في الساعة ${t12}`.trim(),
        type: NotificationType.COURSE_UPDATE,
        priority: NotificationPriority.HIGH,
        recipientType: RecipientType.SPECIFIC_TEACHERS,
        recipientIds: [String(session.teacher_id)],
        data: { ...commonData, role: 'teacher' },
        createdBy: String(me.id),
      });
    } catch (err) {
      req.log?.warn({ err }, 'attendance notifications failed');
    }

    res.status(201).json(ok(record, 'تم تسجيل الحضور بنجاح'));
  }

  // GET /api/student/attendance/by-course/:courseId
  static async getMyAttendanceByCourse(req: Request, res: Response): Promise<void> {
    const me = req.user;
    const courseId = req.params['courseId'] as string;
    const rows = await AttendanceModel.getStudentAttendanceByCourse(me.id, courseId);
    const data = rows.map((it: any) => ({
      ...it,
      checkin_at_12h: to12hFromISO(it.checkin_at),
    }));
    res.status(200).json(ok(data, 'تم جلب سجل الحضور'));
  }
}
