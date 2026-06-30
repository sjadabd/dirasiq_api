import cron from 'node-cron';
import { TokenModel } from '../models/token.model';
import { CourseReminderService } from './course-reminder.service';
import { NotificationService } from './notification.service';
import { SessionEndReminderService } from './session-end-reminder.service';
import { SessionStartReminderService } from './session-start-reminder.service';

export class NotificationCronService {
  private notificationService: NotificationService;
  private isRunning: boolean = false;
  private courseReminderService: CourseReminderService;
  private sessionEndReminderService: SessionEndReminderService;
  private sessionStartReminderService: SessionStartReminderService;

  constructor() {
    const oneSignalConfig = {
      appId: process.env['ONESIGNAL_APP_ID'] || '',
      restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || '',
    };

    this.notificationService = new NotificationService(oneSignalConfig);
    this.courseReminderService = new CourseReminderService();
    this.sessionEndReminderService = new SessionEndReminderService(
      this.notificationService
    );
    this.sessionStartReminderService = new SessionStartReminderService(
      this.notificationService
    );
  }

  /**
   * Start the cron job for processing pending notifications
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    // One-time on boot: purge stray attendance rows whose date's weekday doesn't
    // match their session (artifacts of the old "default to today" bug).
    void this.sessionEndReminderService.cleanupWeekdayMismatchedAttendance();

    // Run every minute to check for pending notifications
    cron.schedule('* * * * *', async () => {
      try {
        await this.notificationService.processPendingNotifications();
        // Send 5-minute-before-start reminders for sessions starting soon
        await this.sessionStartReminderService.sendFiveMinuteBeforeStartReminders();
        // Send 30-minute-before-start reminders for students
        await this.sessionStartReminderService.sendThirtyMinuteBeforeStartStudentReminders();
        // Also send 3-minute-before-end reminders for sessions ending soon
        await this.sessionEndReminderService.sendThreeMinuteBeforeEndReminders();
        // After a session ends, auto-mark un-checked-in attendees as absent
        await this.sessionEndReminderService.markAbsenteesForEndedSessions();
      } catch (error) {
        console.error('❌ Error processing pending notifications:', error);
      }
    });

    // Daily at 09:00 Asia/Baghdad time: send course start reminders (3, 2, 1 days before)
    cron.schedule(
      '0 9 * * *',
      async () => {
        try {
          await this.courseReminderService.sendReminders();
        } catch (error) {
          console.error('❌ Error sending course start reminders:', error);
        }
      },
      { timezone: 'Asia/Baghdad' }
    );

    // Daily at 03:00 Asia/Baghdad time: remove expired tokens only.
    cron.schedule(
      '0 3 * * *',
      async () => {
        try {
          const cleaned = await TokenModel.cleanExpiredTokens();
          console.log(
            `🧹 Cleaned ${cleaned} expired tokens at 03:00 Asia/Baghdad`
          );
        } catch (error) {
          console.error('❌ Error cleaning expired tokens:', error);
        }
      },
      { timezone: 'Asia/Baghdad' }
    );

    this.isRunning = true;
  }

  /**
   * Stop the cron job
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    // Note: node-cron doesn't have a destroy method, we'll just set the flag
    this.isRunning = false;
  }

  /**
   * Get cron service status
   */
  getStatus(): { isRunning: boolean } {
    return { isRunning: this.isRunning };
  }
}

// Export singleton instance
export const notificationCronService = new NotificationCronService();
