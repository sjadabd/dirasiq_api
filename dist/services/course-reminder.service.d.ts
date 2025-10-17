export declare class CourseReminderService {
    private notificationService;
    constructor();
    sendReminders(): Promise<void>;
    sendReminderForCourse(courseId: string, daysUntilStart?: number): Promise<void>;
    private sendReminderForOffset;
}
//# sourceMappingURL=course-reminder.service.d.ts.map