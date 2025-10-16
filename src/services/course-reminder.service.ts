import pool from '../config/database';
import { NotificationType, RecipientType } from '../models/notification.model';
import { NotificationService } from '../services/notification.service';

export class CourseReminderService {
  private notificationService: NotificationService;

  constructor() {
    const oneSignalConfig = {
      appId: process.env['ONESIGNAL_APP_ID'] || '',
      restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || ''
    };
    this.notificationService = new NotificationService(oneSignalConfig);
  }

  /**
   * Send reminders for courses starting in N days (N in [3,2,1])
   */
  async sendReminders(): Promise<void> {
    for (const days of [3, 2, 1]) {
      await this.sendReminderForOffset(days);
    }
  }

  /**
   * Manually trigger reminder for a specific course (ignores date filters)
   * Useful for testing via CLI.
   */
  async sendReminderForCourse(courseId: string, daysUntilStart: number = 1): Promise<void> {
    const query = `
      SELECT
        c.id AS course_id,
        c.course_name,
        c.start_date,
        c.teacher_id,
        cb.student_id
      FROM courses c
      JOIN course_bookings cb ON cb.course_id = c.id
      WHERE c.is_deleted = false
        AND cb.is_deleted = false
        AND cb.status = 'confirmed'
        AND c.id = $1
    `;

    const result = await pool.query(query, [courseId]);
    if (result.rows.length === 0) return;

    const studentIds = Array.from(new Set(result.rows.map(r => r.student_id as string)));
    const courseName = result.rows[0].course_name as string;
    const createdBy = result.rows[0].teacher_id as string; // valid UUID

    const title = `تذكير دورة - ${courseName}`;
    const message = daysUntilStart === 1
      ? `غدًا تبدأ دورتك: ${courseName}. يرجى الاستعداد.`
      : `تبقى ${daysUntilStart} أيام لبدء دورتك: ${courseName}. يرجى الاستعداد.`;

    await this.notificationService.createAndSendNotification({
      title,
      message,
      type: NotificationType.CLASS_REMINDER,
      priority: 'high' as any,
      recipientType: RecipientType.SPECIFIC_STUDENTS,
      recipientIds: studentIds,
      data: { courseId, daysUntilStart, manual: true },
      createdBy
    });
  }

  private async sendReminderForOffset(daysUntilStart: number): Promise<void> {
    // Find courses starting exactly in N days and students with confirmed bookings
    const query = `
      SELECT
        c.id AS course_id,
        c.course_name,
        c.start_date,
        c.study_year,
        c.teacher_id,
        cb.student_id
      FROM courses c
      JOIN course_bookings cb ON cb.course_id = c.id
      WHERE c.is_deleted = false
        AND cb.is_deleted = false
        AND cb.status = 'confirmed'
        AND DATE(c.start_date) = (CURRENT_DATE + INTERVAL '${daysUntilStart} day')
    `;

    const result = await pool.query(query);
    if (result.rows.length === 0) return;

    // Group by course to build collapse/grouping keys
    const byCourse: Record<string, { courseName: string; studentIds: string[]; teacherId: string }> = {};
    for (const row of result.rows) {
      const cid = row.course_id as string;
      if (!byCourse[cid]) {
        byCourse[cid] = { courseName: row.course_name, studentIds: [], teacherId: row.teacher_id };
      }
      byCourse[cid].studentIds.push(row.student_id);
    }

    for (const [courseId, { courseName, studentIds, teacherId }] of Object.entries(byCourse)) {
      const title = `تذكير دورة - ${courseName}`;
      const message = daysUntilStart === 1
        ? `غدًا تبدأ دورتك: ${courseName}. يرجى الاستعداد.`
        : `تبقى ${daysUntilStart} أيام لبدء دورتك: ${courseName}. يرجى الاستعداد.`;

      await this.notificationService.createAndSendNotification({
        title,
        message,
        type: NotificationType.CLASS_REMINDER,
        priority: 'high' as any,
        recipientType: RecipientType.SPECIFIC_STUDENTS,
        recipientIds: studentIds,
        data: { courseId, daysUntilStart },
        createdBy: teacherId
      });
    }
  }
}
