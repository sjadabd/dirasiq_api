import pool from '@/config/database';
import { NotificationService } from './notification.service';
import { NotificationPriority, NotificationType, RecipientType } from '@/models/notification.model';

export class SessionEndReminderService {
  private notif: NotificationService;

  constructor(notif: NotificationService) {
    this.notif = notif;
  }

  /**
   * Send notifications to teachers for sessions that will end in exactly 3 minutes (minute precision).
   * Runs every minute.
   */
  async sendThreeMinuteBeforeEndReminders(): Promise<void> {
    // Find sessions whose end_time equals date_trunc('minute', now() + 3 minutes)
    const q = `
      SELECT id, teacher_id, title, end_time
      FROM sessions
      WHERE is_deleted = false
        AND state IN ('draft','proposed','conflict','confirmed','negotiating')
        AND weekday = EXTRACT(DOW FROM NOW())::int
        AND start_time <= (NOW()::time)
        AND end_time = (date_trunc('minute', NOW() + interval '3 minutes'))::time
    `;

    const r = await pool.query(q);
    const sessions = r.rows as Array<{ id: string; teacher_id: string; title?: string | null; end_time: string }>;

    for (const s of sessions) {
      try {
        await this.notif.createAndSendNotification({
          title: 'تنبيه نهاية الدرس',
          message: 'ستَنتهي المحاضرة بعد 3 دقائق',
          type: NotificationType.COURSE_UPDATE,
          priority: NotificationPriority.HIGH,
          recipientType: RecipientType.SPECIFIC_TEACHERS,
          recipientIds: [String(s.teacher_id)],
          data: { sessionId: s.id, endsAt: s.end_time, reminder: '3min_before_end' },
          createdBy: String(s.teacher_id),
        });
      } catch (e) {
        console.error('Failed to send 3-min end reminder for session', s.id, e);
      }
    }
  }
}
