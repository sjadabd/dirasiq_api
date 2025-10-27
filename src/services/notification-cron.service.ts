import cron from 'node-cron';
import { NotificationService } from './notification.service';
import { CourseReminderService } from './course-reminder.service';
import { SessionEndReminderService } from './session-end-reminder.service';
import { SessionStartReminderService } from './session-start-reminder.service';
import { TokenModel } from '../models/token.model';

export class NotificationCronService {
  private notificationService: NotificationService;
  private isRunning: boolean = false;
  private courseReminderService: CourseReminderService;
  private sessionEndReminderService: SessionEndReminderService;
  private sessionStartReminderService: SessionStartReminderService;

  constructor() {
    const oneSignalConfig = {
      appId: process.env['ONESIGNAL_APP_ID'] || '',
      restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || ''
    };

    this.notificationService = new NotificationService(oneSignalConfig);
    this.courseReminderService = new CourseReminderService();
    this.sessionEndReminderService = new SessionEndReminderService(this.notificationService);
    this.sessionStartReminderService = new SessionStartReminderService(this.notificationService);
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
        // Send 5-minute-before-start reminders for sessions starting soon
        await this.sessionStartReminderService.sendFiveMinuteBeforeStartReminders();
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

    // Daily at 03:00 Asia/Baghdad time: purge all teacher tokens and clean expired tokens
    cron.schedule('0 3 * * *', async () => {
      try {
        const deletedTeachers = await TokenModel.deleteAllTeacherTokens();
        const cleaned = await TokenModel.cleanExpiredTokens();
        console.log(`🧹 Purged ${deletedTeachers} teacher tokens and cleaned ${cleaned} expired tokens at 03:00 Asia/Baghdad`);
      } catch (error) {
        console.error('❌ Error purging teacher tokens:', error);
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
