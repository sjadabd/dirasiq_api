"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationCronService = exports.NotificationCronService = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const notification_service_1 = require("./notification.service");
const course_reminder_service_1 = require("./course-reminder.service");
const session_end_reminder_service_1 = require("./session-end-reminder.service");
const session_start_reminder_service_1 = require("./session-start-reminder.service");
class NotificationCronService {
    constructor() {
        this.isRunning = false;
        const oneSignalConfig = {
            appId: process.env['ONESIGNAL_APP_ID'] || '',
            restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || ''
        };
        this.notificationService = new notification_service_1.NotificationService(oneSignalConfig);
        this.courseReminderService = new course_reminder_service_1.CourseReminderService();
        this.sessionEndReminderService = new session_end_reminder_service_1.SessionEndReminderService(this.notificationService);
        this.sessionStartReminderService = new session_start_reminder_service_1.SessionStartReminderService(this.notificationService);
    }
    start() {
        if (this.isRunning) {
            return;
        }
        node_cron_1.default.schedule('* * * * *', async () => {
            try {
                await this.notificationService.processPendingNotifications();
                await this.sessionStartReminderService.sendFiveMinuteBeforeStartReminders();
                await this.sessionEndReminderService.sendThreeMinuteBeforeEndReminders();
            }
            catch (error) {
                console.error('❌ Error processing pending notifications:', error);
            }
        });
        node_cron_1.default.schedule('0 9 * * *', async () => {
            try {
                await this.courseReminderService.sendReminders();
            }
            catch (error) {
                console.error('❌ Error sending course start reminders:', error);
            }
        }, { timezone: 'Asia/Baghdad' });
        this.isRunning = true;
    }
    stop() {
        if (!this.isRunning) {
            return;
        }
        this.isRunning = false;
    }
    getStatus() {
        return { isRunning: this.isRunning };
    }
}
exports.NotificationCronService = NotificationCronService;
exports.notificationCronService = new NotificationCronService();
//# sourceMappingURL=notification-cron.service.js.map