"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentAttendanceController = void 0;
const attendance_model_1 = require("../../models/attendance.model");
const notification_model_1 = require("../../models/notification.model");
const notification_service_1 = require("../../services/notification.service");
class StudentAttendanceController {
    static to12hFromISO(iso) {
        if (!iso)
            return null;
        const d = new Date(iso);
        if (isNaN(d.getTime()))
            return null;
        let h = d.getHours();
        const m = d.getMinutes();
        const am = h < 12;
        h = h % 12;
        if (h === 0)
            h = 12;
        const mm = m.toString().padStart(2, '0');
        return `${h}:${mm} ${am ? 'صباحاً' : 'مساءً'}`;
    }
    static async checkIn(req, res) {
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
            const session = await attendance_model_1.AttendanceModel.findActiveSessionForTeacherNow(teacherId);
            if (!session) {
                res.status(404).json({ success: false, message: 'لا توجد محاضرة حالية لهذا المعلم', errors: ['لا توجد جلسة مطابقة الآن'] });
                return;
            }
            const eligible = await attendance_model_1.AttendanceModel.isStudentEligibleForSession(session.id, session.course_id, me.id);
            if (!eligible) {
                res.status(403).json({ success: false, message: 'لا تنتمي إلى هذه المحاضرة', errors: ['الطالب غير مسجل في هذه الدورة/الجلسة'] });
                return;
            }
            const occurredOnISO = new Date().toISOString().substring(0, 10);
            const already = await attendance_model_1.AttendanceModel.hasCheckedIn(session.id, me.id, occurredOnISO);
            if (already) {
                res.status(200).json({ success: true, message: 'تم تسجيل حضورك مسبقاً', data: { duplicate: true, sessionId: session.id } });
                return;
            }
            const record = await attendance_model_1.AttendanceModel.checkIn({
                sessionId: session.id,
                courseId: session.course_id,
                teacherId: session.teacher_id,
                studentId: me.id,
                occurredOnISO,
                source: 'qr',
            });
            try {
                const oneSignalConfig = {
                    appId: process.env['ONESIGNAL_APP_ID'] || '',
                    restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || '',
                };
                const notifService = new notification_service_1.NotificationService(oneSignalConfig);
                const commonData = {
                    sessionId: session.id,
                    courseId: session.course_id,
                    teacherId: session.teacher_id,
                    studentId: me.id,
                    occurredOn: occurredOnISO,
                };
                const t12 = StudentAttendanceController.to12hFromISO(record.checkin_at) || '';
                void notifService.createAndSendNotification({
                    title: 'تأكيد الحضور',
                    message: `تم تسجيل حضورك بنجاح للدرس الحالي في الساعة ${t12}`.trim(),
                    type: notification_model_1.NotificationType.COURSE_UPDATE,
                    priority: notification_model_1.NotificationPriority.HIGH,
                    recipientType: notification_model_1.RecipientType.SPECIFIC_STUDENTS,
                    recipientIds: [String(me.id)],
                    data: { ...commonData, role: 'student' },
                    createdBy: String(me.id),
                });
                void notifService.createAndSendNotification({
                    title: 'حضور طالب',
                    message: `تم تسجيل حضور الطالب ${me.name ? String(me.name) : ''} إلى الدرس الحالي في الساعة ${t12}`.trim(),
                    type: notification_model_1.NotificationType.COURSE_UPDATE,
                    priority: notification_model_1.NotificationPriority.HIGH,
                    recipientType: notification_model_1.RecipientType.SPECIFIC_TEACHERS,
                    recipientIds: [String(session.teacher_id)],
                    data: { ...commonData, role: 'teacher' },
                    createdBy: String(me.id),
                });
            }
            catch (e) {
                console.error('Failed to send attendance notifications:', e);
            }
            res.status(201).json({ success: true, message: 'تم تسجيل الحضور بنجاح', data: record });
        }
        catch (error) {
            console.error('Attendance check-in error:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['تعذر تسجيل الحضور'] });
        }
    }
    static async getMyAttendanceByCourse(req, res) {
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
            let data = await attendance_model_1.AttendanceModel.getStudentAttendanceByCourse(me.id, courseId);
            data = data.map((it) => ({
                ...it,
                checkin_at_12h: StudentAttendanceController.to12hFromISO(it.checkin_at),
            }));
            res.status(200).json({ success: true, message: 'تم جلب سجل الحضور', data });
        }
        catch (error) {
            console.error('Error getting attendance by course:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
        }
    }
}
exports.StudentAttendanceController = StudentAttendanceController;
//# sourceMappingURL=attendance.controller.js.map