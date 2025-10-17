"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionStartReminderService = void 0;
const database_1 = __importDefault(require("../config/database"));
const notification_model_1 = require("../models/notification.model");
class SessionStartReminderService {
    constructor(notif) {
        this.notif = notif;
    }
    weekdayName(d) {
        const names = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        return names[d] ?? String(d);
    }
    async sendFiveMinuteBeforeStartReminders() {
        const q = `
      SELECT s.id, s.teacher_id, s.title, s.start_time, s.end_time, s.weekday, c.course_name
      FROM sessions s
      JOIN courses c ON c.id = s.course_id
      WHERE s.is_deleted = false
        AND s.state IN ('draft','proposed','conflict','confirmed','negotiating')
        AND s.weekday = EXTRACT(DOW FROM NOW())::int
        AND s.start_time = (date_trunc('minute', NOW() + interval '5 minutes'))::time
    `;
        const r = await database_1.default.query(q);
        const sessions = r.rows;
        for (const s of sessions) {
            try {
                const dayName = this.weekdayName(Number(s.weekday));
                const title = s.title ? `${s.title}` : (s.course_name ? `${s.course_name}` : 'محاضرة');
                await this.notif.createAndSendNotification({
                    title: 'تذكير بدء المحاضرة',
                    message: `ستبدأ ${title} بعد 5 دقائق (اليوم: ${dayName}، ${s.start_time} - ${s.end_time})`,
                    type: notification_model_1.NotificationType.COURSE_UPDATE,
                    priority: notification_model_1.NotificationPriority.HIGH,
                    recipientType: notification_model_1.RecipientType.SPECIFIC_TEACHERS,
                    recipientIds: [String(s.teacher_id)],
                    data: { sessionId: s.id, startsAt: s.start_time, endsAt: s.end_time, reminder: '5min_before_start' },
                    createdBy: String(s.teacher_id),
                });
            }
            catch (e) {
                console.error('Failed to send 5-min start reminder for session', s.id, e);
            }
        }
    }
}
exports.SessionStartReminderService = SessionStartReminderService;
//# sourceMappingURL=session-start-reminder.service.js.map