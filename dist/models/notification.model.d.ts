export declare enum NotificationType {
    HOMEWORK_REMINDER = "homework_reminder",
    COURSE_UPDATE = "course_update",
    BOOKING_CONFIRMATION = "booking_confirmation",
    BOOKING_CANCELLATION = "booking_cancellation",
    NEW_BOOKING = "new_booking",
    PAYMENT_REMINDER = "payment_reminder",
    SYSTEM_ANNOUNCEMENT = "system_announcement",
    GRADE_UPDATE = "grade_update",
    ASSIGNMENT_DUE = "assignment_due",
    CLASS_REMINDER = "class_reminder",
    TEACHER_MESSAGE = "teacher_message",
    PARENT_NOTIFICATION = "parent_notification",
    SUBSCRIPTION_EXPIRY = "subscription_expiry",
    NEW_COURSE_AVAILABLE = "new_course_available",
    COURSE_COMPLETION = "course_completion",
    FEEDBACK_REQUEST = "feedback_request"
}
export declare enum NotificationPriority {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    URGENT = "urgent"
}
export declare enum NotificationStatus {
    PENDING = "pending",
    SENT = "sent",
    DELIVERED = "delivered",
    READ = "read",
    FAILED = "failed"
}
export declare enum RecipientType {
    ALL = "all",
    TEACHERS = "teachers",
    STUDENTS = "students",
    SPECIFIC_TEACHERS = "specific_teachers",
    SPECIFIC_STUDENTS = "specific_students",
    PARENTS = "parents"
}
export interface Notification {
    id: string;
    title: string;
    message: string;
    type: NotificationType;
    priority: NotificationPriority;
    status: NotificationStatus;
    recipientType: RecipientType;
    recipientIds?: string[];
    data?: Record<string, any>;
    studyYear?: string;
    scheduledAt?: Date;
    sentAt?: Date;
    readAt?: Date;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    isRead?: boolean;
}
export interface CreateNotificationData {
    title: string;
    message: string;
    type: NotificationType;
    priority?: NotificationPriority;
    recipientType: RecipientType;
    recipientIds?: string[];
    data?: Record<string, any>;
    scheduledAt?: Date;
    createdBy: string;
}
export interface NotificationFilters {
    type?: NotificationType;
    status?: NotificationStatus;
    priority?: NotificationPriority;
    recipientType?: RecipientType;
    createdBy?: string;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    limit?: number;
}
export declare class NotificationModel {
    static create(notificationData: CreateNotificationData): Promise<Notification>;
    static getUserNotificationsWithFilters(userId: string, options: {
        page?: number;
        limit?: number;
        q?: string | null;
        type?: NotificationType | null;
        courseId?: string | null;
        subType?: string | null;
    }): Promise<{
        notifications: any[];
        total: number;
        totalPages: number;
    }>;
    static findById(id: string): Promise<Notification | null>;
    static findMany(filters?: NotificationFilters): Promise<{
        notifications: Notification[];
        total: number;
        totalPages: number;
    }>;
    static updateStatus(id: string, status: NotificationStatus, additionalData?: {
        sentAt?: Date;
        readAt?: Date;
    }): Promise<Notification | null>;
    static getPendingNotifications(): Promise<Notification[]>;
    static getUserNotifications(userId: string, page?: number, limit?: number): Promise<{
        notifications: any[];
        total: number;
        totalPages: number;
    }>;
    static markAsRead(notificationId: string, userId: string): Promise<boolean>;
    static delete(id: string): Promise<boolean>;
    static softDeleteByAssignmentId(assignmentId: string): Promise<number>;
    static getStatistics(): Promise<{
        total: number;
        sent: number;
        pending: number;
        failed: number;
        byType: Record<NotificationType, number>;
        byPriority: Record<NotificationPriority, number>;
    }>;
    private static mapDatabaseNotificationToNotification;
}
//# sourceMappingURL=notification.model.d.ts.map