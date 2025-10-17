import pool from '../config/database';
import { NotificationPriority, NotificationType, RecipientType } from '../models/notification.model';
import { NotificationService } from './notification.service';

export class SessionStartReminderService {
  private notif: NotificationService;

  constructor(notif: NotificationService) {
    this.notif = notif;
  }

  // Helper to convert DOW (0-6) to Arabic day name
  private weekdayName(d: number): string {
    const names = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    return names[d] ?? String(d);
  }

  /**
   * Send notifications to teachers for sessions that will start in exactly 5 minutes (minute precision).
   * Runs every minute.
   */
  async sendFiveMinuteBeforeStartReminders(): Promise<void> {
    const q = `
      SELECT s.id, s.teacher_id, s.title, s.start_time, s.end_time, s.weekday, c.course_name
      FROM sessions s
      JOIN courses c ON c.id = s.course_id
      WHERE s.is_deleted = false
        AND s.state IN ('draft','proposed','conflict','confirmed','negotiating')
        AND s.weekday = EXTRACT(DOW FROM NOW())::int
        AND s.start_time = (date_trunc('minute', NOW() + interval '5 minutes'))::time
    `;

    const r = await pool.query(q);
    const sessions = r.rows as Array<{
      id: string;
      teacher_id: string;
      title?: string | null;
      start_time: string;
      end_time: string;
      weekday: number;
      course_name?: string | null;
    }>;

    for (const s of sessions) {
      try {
        const dayName = this.weekdayName(Number(s.weekday));
        const title = s.title ? `${s.title}` : (s.course_name ? `${s.course_name}` : 'محاضرة');
        await this.notif.createAndSendNotification({
          title: 'تذكير بدء المحاضرة',
          message: `ستبدأ ${title} بعد 5 دقائق (اليوم: ${dayName}، ${s.start_time} - ${s.end_time})`,
          type: NotificationType.COURSE_UPDATE,
          priority: NotificationPriority.HIGH,
          recipientType: RecipientType.SPECIFIC_TEACHERS,
          recipientIds: [String(s.teacher_id)],
          data: { sessionId: s.id, startsAt: s.start_time, endsAt: s.end_time, reminder: '5min_before_start' },
          createdBy: String(s.teacher_id),
        });
      } catch (e) {
        console.error('Failed to send 5-min start reminder for session', s.id, e);
      }
    }
  }
}
