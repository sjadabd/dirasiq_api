export declare class NotificationCronService {
    private notificationService;
    private isRunning;
    private courseReminderService;
    private sessionEndReminderService;
    private sessionStartReminderService;
    constructor();
    start(): void;
    stop(): void;
    getStatus(): {
        isRunning: boolean;
    };
}
export declare const notificationCronService: NotificationCronService;
//# sourceMappingURL=notification-cron.service.d.ts.map