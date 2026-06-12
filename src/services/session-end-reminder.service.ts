import pool from '../config/database';
import { NotificationPriority, NotificationType, RecipientType } from '../models/notification.model';
import { NotificationService } from './notification.service';

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
        AND weekday = EXTRACT(DOW FROM (NOW() AT TIME ZONE 'Asia/Baghdad'))::int
        AND start_time <= ((NOW() AT TIME ZONE 'Asia/Baghdad')::time)
        AND end_time = (date_trunc('minute', (NOW() AT TIME ZONE 'Asia/Baghdad') + interval '3 minutes'))::time
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

  /**
   * After a session ends, persist an `absent` row for every enrolled attendee
   * who was NOT checked in (QR) and was NOT marked by the teacher. Runs every
   * minute over sessions that ended in the last 20 minutes (a trailing window
   * that tolerates a missed tick / short restart). The insert is idempotent —
   * `ON CONFLICT DO NOTHING` never overwrites a present (qr), leave, or manual
   * row, so it only fills the gaps. Once persisted, the absence shows for both
   * the student and the teacher through the existing read paths.
   */
  async markAbsenteesForEndedSessions(): Promise<void> {
    // Sessions whose end (today's date + end_time, Asia/Baghdad) fell within the
    // last 20 minutes. Comparing full timestamps avoids the time-only wrap bug
    // around midnight.
    const q = `
      SELECT id, course_id, teacher_id
      FROM sessions
      WHERE is_deleted = false
        AND state IN ('draft','proposed','conflict','confirmed','negotiating')
        AND weekday = EXTRACT(DOW FROM (NOW() AT TIME ZONE 'Asia/Baghdad'))::int
        AND ((NOW() AT TIME ZONE 'Asia/Baghdad')::date + end_time)
              BETWEEN ((NOW() AT TIME ZONE 'Asia/Baghdad') - interval '20 minutes')
                  AND (NOW() AT TIME ZONE 'Asia/Baghdad')
    `;

    const r = await pool.query(q);
    const sessions = r.rows as Array<{ id: string; course_id: string; teacher_id: string }>;

    for (const s of sessions) {
      try {
        await pool.query(
          `INSERT INTO session_attendance
             (session_id, course_id, teacher_id, student_id, occurred_on, source, meta)
           SELECT $1, $2, $3, sa.student_id,
                  (NOW() AT TIME ZONE 'Asia/Baghdad')::date,
                  'system', jsonb_build_object('status', 'absent')
             FROM session_attendees sa
             JOIN users u ON u.id = sa.student_id
                         AND u.user_type = 'student'
                         AND u.deleted_at IS NULL
            WHERE sa.session_id = $1
           ON CONFLICT (session_id, student_id, occurred_on) DO NOTHING`,
          [s.id, s.course_id, s.teacher_id],
        );
      } catch (e) {
        console.error('Failed to auto-mark absentees for session', s.id, e);
      }
    }
  }

  /**
   * Remove attendance rows whose date's weekday doesn't match their session's
   * weekday. A session only occurs on its own weekday, so such rows are always
   * wrong — they are strays from the old bug where the teacher attendance
   * screen defaulted to "today" instead of the session's occurrence date,
   * producing a second row for the same student. Safe + idempotent: legitimate
   * rows always match (QR + the fixed manual edit both key on the session's
   * weekday). Postgres DOW (0=Sun..6=Sat) matches the sessions.weekday convention.
   */
  async cleanupWeekdayMismatchedAttendance(): Promise<void> {
    try {
      const r = await pool.query(
        `DELETE FROM session_attendance a
           USING sessions s
          WHERE s.id = a.session_id
            AND EXTRACT(DOW FROM a.occurred_on)::int <> s.weekday`,
      );
      if (r.rowCount && r.rowCount > 0) {
        console.log(`🧹 Removed ${r.rowCount} weekday-mismatched attendance rows`);
      }
    } catch (e) {
      console.error('Failed to clean up weekday-mismatched attendance', e);
    }
  }
}
