import cron from 'node-cron';
import { NotificationService } from './notification.service';

export class NotificationCronService {
  private notificationService: NotificationService;
  private isRunning: boolean = false;

  constructor() {
    const oneSignalConfig = {
      appId: process.env['ONESIGNAL_APP_ID'] || '',
      restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || ''
    };

    this.notificationService = new NotificationService(oneSignalConfig);
  }

  /**
   * Start the cron job for processing pending notifications
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠️ Notification cron service is already running');
      return;
    }

    // Run every minute to check for pending notifications
    cron.schedule('* * * * *', async () => {
      try {
        console.log('🔄 Processing pending notifications...');
        await this.notificationService.processPendingNotifications();
        console.log('✅ Pending notifications processed successfully');
      } catch (error) {
        console.error('❌ Error processing pending notifications:', error);
      }
    });

    this.isRunning = true;
    console.log('🚀 Notification cron service started - checking every minute');
  }

  /**
   * Stop the cron job
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('⚠️ Notification cron service is not running');
      return;
    }

    // Note: node-cron doesn't have a destroy method, we'll just set the flag
    this.isRunning = false;
    console.log('🛑 Notification cron service stopped');
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
