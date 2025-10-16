import { Request, Response } from 'express';
import { AttendanceModel } from '../../models/attendance.model';
import { NotificationPriority, NotificationType, RecipientType } from '../../models/notification.model';
import { NotificationService } from '../../services/notification.service';

export class StudentAttendanceController {
  // Helpers: format time to 12-hour with Arabic AM/PM
  private static to12hFromISO(iso?: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    let h = d.getHours();
    const m = d.getMinutes();
    const am = h < 12;
    h = h % 12;
    if (h === 0) h = 12;
    const mm = m.toString().padStart(2, '0');
    return `${h}:${mm} ${am ? 'صباحاً' : 'مساءً'}`;
  }
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
        const t12 = StudentAttendanceController.to12hFromISO(record.checkin_at) || '';
        void notifService.createAndSendNotification({
          title: 'تأكيد الحضور',
          message: `تم تسجيل حضورك بنجاح للدرس الحالي في الساعة ${t12}`.trim(),
          type: NotificationType.COURSE_UPDATE,
          priority: NotificationPriority.HIGH,
          recipientType: RecipientType.SPECIFIC_STUDENTS,
          recipientIds: [String(me.id)],
          data: { ...commonData, role: 'student' },
          createdBy: String(me.id),
        });

        // Notify teacher that a student has checked in (include student name and time)
        void notifService.createAndSendNotification({
          title: 'حضور طالب',
          message: `تم تسجيل حضور الطالب ${me.name ? String(me.name) : ''} إلى الدرس الحالي في الساعة ${t12}`.trim(),
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

  // GET /api/student/attendance/by-course/:courseId
  // GET /api/student/attendance/by-course/:courseId
  static async getMyAttendanceByCourse(req: Request<{ courseId: string }>, res: Response): Promise<void> {
    try {
      const me = req.user;
      if (!me) {
        res.status(401).json({ success: false, message: 'غير مصادق', errors: ['المستخدم غير مصادق عليه'] });
        return;
      }

      const courseId = req.params['courseId'];
      if (!courseId) {
        res.status(400).json({ success: false, message: 'بيانات ناقصة', errors: ['courseId مطلوب'] });
        return;
      }

      let data = await AttendanceModel.getStudentAttendanceByCourse(me.id, courseId);
      // add 12h formatted check-in time for display
      data = data.map((it: any) => ({
        ...it,
        checkin_at_12h: StudentAttendanceController.to12hFromISO(it.checkin_at),
      }));
      res.status(200).json({ success: true, message: 'تم جلب سجل الحضور', data });
    } catch (error) {
      console.error('Error getting attendance by course:', error);
      res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
    }
  }
}
