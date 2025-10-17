"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionEndReminderService = void 0;
const database_1 = __importDefault(require("../config/database"));
const notification_model_1 = require("../models/notification.model");
class SessionEndReminderService {
    constructor(notif) {
        this.notif = notif;
    }
    async sendThreeMinuteBeforeEndReminders() {
        const q = `
      SELECT id, teacher_id, title, end_time
      FROM sessions
      WHERE is_deleted = false
        AND state IN ('draft','proposed','conflict','confirmed','negotiating')
        AND weekday = EXTRACT(DOW FROM NOW())::int
        AND start_time <= (NOW()::time)
        AND end_time = (date_trunc('minute', NOW() + interval '3 minutes'))::time
    `;
        const r = await database_1.default.query(q);
        const sessions = r.rows;
        for (const s of sessions) {
            try {
                await this.notif.createAndSendNotification({
                    title: 'تنبيه نهاية الدرس',
                    message: 'ستَنتهي المحاضرة بعد 3 دقائق',
                    type: notification_model_1.NotificationType.COURSE_UPDATE,
                    priority: notification_model_1.NotificationPriority.HIGH,
                    recipientType: notification_model_1.RecipientType.SPECIFIC_TEACHERS,
                    recipientIds: [String(s.teacher_id)],
                    data: { sessionId: s.id, endsAt: s.end_time, reminder: '3min_before_end' },
                    createdBy: String(s.teacher_id),
                });
            }
            catch (e) {
                console.error('Failed to send 3-min end reminder for session', s.id, e);
            }
        }
    }
}
exports.SessionEndReminderService = SessionEndReminderService;
//# sourceMappingURL=session-end-reminder.service.js.map