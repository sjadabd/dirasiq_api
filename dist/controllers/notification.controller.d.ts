import { Request, Response } from 'express';
import { NotificationType, RecipientType } from '../models/notification.model';
export declare class NotificationController {
    private notificationService;
    constructor();
    sendToAll: (req: Request, res: Response) => Promise<void>;
    sendToTeachers: (req: Request, res: Response) => Promise<void>;
    sendToStudents: (req: Request, res: Response) => Promise<void>;
    sendToSpecificUsers: (req: Request, res: Response) => Promise<void>;
    sendTemplateNotification: (req: Request, res: Response) => Promise<void>;
    getNotifications: (req: Request, res: Response) => Promise<void>;
    getNotificationById: (req: Request, res: Response) => Promise<void>;
    getUserNotifications: (req: Request, res: Response) => Promise<void>;
    createAndSendNotification: (notificationData: {
        title: string;
        message: string;
        type: NotificationType;
        priority?: "low" | "medium" | "high" | "urgent";
        recipientType: RecipientType;
        recipientIds?: string[];
        data?: Record<string, any>;
        scheduledAt?: Date;
        createdBy: string;
    }) => Promise<any>;
    markAsRead: (req: Request, res: Response) => Promise<void>;
    getStatistics: (_req: Request, res: Response) => Promise<void>;
    processPendingNotifications: (_req: Request, res: Response) => Promise<void>;
    deleteNotification: (req: Request, res: Response) => Promise<void>;
}
export declare const notificationValidation: {
    sendNotification: import("express-validator").ValidationChain[];
    sendToSpecificUsers: import("express-validator").ValidationChain[];
    sendTemplateNotification: import("express-validator").ValidationChain[];
    getNotifications: import("express-validator").ValidationChain[];
    getNotificationById: import("express-validator").ValidationChain[];
    markAsRead: import("express-validator").ValidationChain[];
    deleteNotification: import("express-validator").ValidationChain[];
};
//# sourceMappingURL=notification.controller.d.ts.map