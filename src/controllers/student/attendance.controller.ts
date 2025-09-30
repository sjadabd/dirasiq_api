import { AttendanceModel } from '@/models/attendance.model';
import { NotificationPriority, NotificationType, RecipientType } from '@/models/notification.model';
import { NotificationService } from '@/services/notification.service';
import { Request, Response } from 'express';

export class StudentAttendanceController {
  // POST /api/student/attendance/check-in
  // body: { teacherId: string }
  static async checkIn(req: Request, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) {
        res.status(401).json({ success: false, message: 'غير مصادق', errors: ['المستخدم غير مصادق عليه'] });
        return;
      }

      const teacherId = String((req.body?.teacherId || '').trim());
      if (!teacherId) {
        res.status(400).json({ success: false, message: 'بيانات ناقصة', errors: ['teacherId مطلوب'] });
        return;
      }

      // Locate an active session for this teacher at current time
      const session = await AttendanceModel.findActiveSessionForTeacherNow(teacherId);
      if (!session) {
        res.status(404).json({ success: false, message: 'لا توجد محاضرة حالية لهذا المعلم', errors: ['لا توجد جلسة مطابقة الآن'] });
        return;
      }

      // Check eligibility: either explicitly in attendees for this session or confirmed booking in the course
      const eligible = await AttendanceModel.isStudentEligibleForSession(session.id, session.course_id, me.id);
      if (!eligible) {
        res.status(403).json({ success: false, message: 'لا تنتمي إلى هذه المحاضرة', errors: ['الطالب غير مسجل في هذه الدورة/الجلسة'] });
        return;
      }

      // Occurrence date (UTC date of today)
      const occurredOnISO = new Date().toISOString().substring(0, 10);

      // Prevent duplicate
      const already = await AttendanceModel.hasCheckedIn(session.id, me.id, occurredOnISO);
      if (already) {
        res.status(200).json({ success: true, message: 'تم تسجيل حضورك مسبقاً', data: { duplicate: true, sessionId: session.id } });
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

      // Fire-and-forget notifications to student and teacher
      try {
        const oneSignalConfig = {
          appId: process.env['ONESIGNAL_APP_ID'] || '',
          restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || '',
        };
        const notifService = new NotificationService(oneSignalConfig);

        const commonData = {
          sessionId: session.id,
          courseId: session.course_id,
          teacherId: session.teacher_id,
          studentId: me.id,
          occurredOn: occurredOnISO,
        };

        // Notify student that check-in succeeded
        void notifService.createAndSendNotification({
          title: 'تأكيد الحضور',
          message: 'تم تسجيل حضورك بنجاح للدرس الحالي',
          type: NotificationType.COURSE_UPDATE,
          priority: NotificationPriority.HIGH,
          recipientType: RecipientType.SPECIFIC_STUDENTS,
          recipientIds: [String(me.id)],
          data: { ...commonData, role: 'student' },
          createdBy: String(me.id),
        });

        // Notify teacher that a student has checked in (include student name if available)
        void notifService.createAndSendNotification({
          title: 'حضور طالب',
          message: `تم تسجيل حضور الطالب ${me.name ? String(me.name) : ''} إلى الدرس الحالي`.trim(),
          type: NotificationType.COURSE_UPDATE,
          priority: NotificationPriority.HIGH,
          recipientType: RecipientType.SPECIFIC_TEACHERS,
          recipientIds: [String(session.teacher_id)],
          data: { ...commonData, role: 'teacher' },
          createdBy: String(me.id),
        });
      } catch (e) {
        console.error('Failed to send attendance notifications:', e);
      }

      res.status(201).json({ success: true, message: 'تم تسجيل الحضور بنجاح', data: record });
    } catch (error) {

      console.error('Attendance check-in error:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['تعذر تسجيل الحضور'] });
    }
  }
}
