import cron from 'node-cron';
import { NotificationService } from './notification.service';
import { CourseReminderService } from './course-reminder.service';
import { SessionEndReminderService } from './session-end-reminder.service';

export class NotificationCronService {
  private notificationService: NotificationService;
  private isRunning: boolean = false;
  private courseReminderService: CourseReminderService;
  private sessionEndReminderService: SessionEndReminderService;

  constructor() {
    const oneSignalConfig = {
      appId: process.env['ONESIGNAL_APP_ID'] || '',
      restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || ''
    };

    this.notificationService = new NotificationService(oneSignalConfig);
    this.courseReminderService = new CourseReminderService();
    this.sessionEndReminderService = new SessionEndReminderService(this.notificationService);
  }

  /**
   * Start the cron job for processing pending notifications
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    // Run every minute to check for pending notifications
    cron.schedule('* * * * *', async () => {
      try {
        await this.notificationService.processPendingNotifications();
        // Also send 3-minute-before-end reminders for sessions ending soon
        await this.sessionEndReminderService.sendThreeMinuteBeforeEndReminders();
      } catch (error) {
        console.error('❌ Error processing pending notifications:', error);
      }
    });

    // Daily at 09:00 Asia/Baghdad time: send course start reminders (3, 2, 1 days before)
    cron.schedule('0 9 * * *', async () => {
      try {
        await this.courseReminderService.sendReminders();
      } catch (error) {
        console.error('❌ Error sending course start reminders:', error);
      }
    }, { timezone: 'Asia/Baghdad' });

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
