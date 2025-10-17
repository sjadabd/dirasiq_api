import { Notification, NotificationType, RecipientType } from '../models/notification.model';
import { UserType } from '../types';
export interface OneSignalConfig {
    appId: string;
    restApiKey: string;
}
export interface SendNotificationOptions {
    title: string;
    message: string;
    data?: Record<string, any>;
    url?: string;
    imageUrl?: string;
    priority?: 'low' | 'normal' | 'high';
    ttl?: number;
    collapseId?: string;
}
export interface NotificationRecipients {
    userIds?: string[];
    userTypes?: UserType[];
    allUsers?: boolean;
}
export declare class NotificationService {
    private oneSignal;
    private config;
    constructor(config: OneSignalConfig);
    private sendToPlayers;
    sendToAll(options: SendNotificationOptions): Promise<boolean>;
    sendToSpecificUsers(userIds: string[], options: SendNotificationOptions): Promise<boolean>;
    sendToUserTypes(userTypes: UserType[], options: SendNotificationOptions): Promise<boolean>;
    createAndSendNotification(notificationData: {
        title: string;
        message: string;
        type: NotificationType;
        priority?: 'low' | 'medium' | 'high' | 'urgent';
        recipientType: RecipientType;
        recipientIds?: string[];
        data?: Record<string, any>;
        scheduledAt?: Date;
        createdBy: string;
    }): Promise<Notification | null>;
    sendTemplateNotification(templateName: string, variables: Record<string, any>, recipients: NotificationRecipients, createdBy: string): Promise<Notification | null>;
    processPendingNotifications(): Promise<void>;
    private sendPendingNotification;
    private getUsersByTypes;
    private mapPriorityToOneSignal;
    private replaceTemplateVariables;
    private getNotificationTemplate;
    getNotificationStats(): Promise<any>;
    getUserNotifications(userId: string, page?: number, limit?: number, options?: {
        q?: string | null;
        type?: NotificationType | null;
        courseId?: string | null;
        subType?: string | null;
    }): Promise<any>;
    markNotificationAsRead(notificationId: string, userId: string): Promise<boolean>;
}
//# sourceMappingURL=notification.service.d.ts.map