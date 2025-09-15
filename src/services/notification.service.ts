import {
  Notification,
  NotificationModel,
  NotificationStatus,
  NotificationType,
  RecipientType,
} from '@/models/notification.model';
import { TokenModel } from '@/models/token.model';
import { UserModel } from '@/models/user.model';
import { UserType } from '@/types';
import { Client } from 'onesignal-node';

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
  ttl?: number; // Time to live in seconds
  collapseId?: string; // For grouping notifications
}

export interface NotificationRecipients {
  userIds?: string[];
  userTypes?: UserType[];
  allUsers?: boolean;
}

export class NotificationService {
  private oneSignal: Client;
  private config: OneSignalConfig;

  constructor(config: OneSignalConfig) {
    this.config = config;
    this.oneSignal = new Client(config.appId, config.restApiKey);
  }

  /**
   * Helper: send to specific playerIds
   */
  private async sendToPlayers(playerIds: string[], options: SendNotificationOptions): Promise<boolean> {
    if (!playerIds || playerIds.length === 0) {
      console.warn('⚠️ No player IDs provided');
      return false;
    }

    const validPlayerIds = playerIds.filter((id) => id && id.trim().length > 0);
    if (validPlayerIds.length === 0) {
      console.warn('⚠️ No valid player IDs found');
      return false;
    }

    const notification: any = {
      app_id: this.config.appId,
      include_player_ids: validPlayerIds,
      headings: { en: options.title, ar: options.title },
      contents: { en: options.message, ar: options.message },
      data: options.data || {},
      priority: options.priority || 'normal',
      ttl: options.ttl || 3600,
    };

    if (options.url) notification.url = options.url;
    if (options.imageUrl) notification.large_icon = options.imageUrl;
    if (options.collapseId) notification.collapse_id = options.collapseId;

    console.log('📤 Sending OneSignal notification to players:', validPlayerIds);
    const response = await this.oneSignal.createNotification(notification);

    if (response.statusCode === 200) {
      console.log('✅ Notification sent successfully');
      return true;
    } else {
      console.error('❌ Notification failed:', response.body);
      return false;
    }
  }

  /**
   * Send notification to all users (OneSignal segments)
   */
  async sendToAll(options: SendNotificationOptions): Promise<boolean> {
    try {
      const notification: any = {
        app_id: this.config.appId,
        included_segments: ['All'],
        headings: { en: options.title, ar: options.title },
        contents: { en: options.message, ar: options.message },
        data: options.data || {},
        priority: options.priority || 'normal',
        ttl: options.ttl || 3600,
      };

      console.log('📤 Sending OneSignal notification to ALL users');
      const response = await this.oneSignal.createNotification(notification);
      return response.statusCode === 200;
    } catch (error: any) {
      console.error('❌ Error sending notification to all users:', error);
      return false;
    }
  }

  /**
   * Send notification to specific users (all their tokens/devices)
   */
  async sendToSpecificUsers(userIds: string[], options: SendNotificationOptions): Promise<boolean> {
    try {
      let allPlayerIds: string[] = [];
      for (const id of userIds) {
        const playerIds = await TokenModel.getPlayerIdsByUserId(id);
        allPlayerIds.push(...(playerIds || []));
      }

      if (allPlayerIds.length === 0) {
        console.warn('⚠️ No valid player IDs found for users:', userIds);
        return false;
      }

      return await this.sendToPlayers(allPlayerIds, options);
    } catch (error) {
      console.error('❌ Error sending to specific users:', error);
      return false;
    }
  }

  /**
   * Send notification to user types (teachers, students, etc.)
   */
  async sendToUserTypes(userTypes: UserType[], options: SendNotificationOptions): Promise<boolean> {
    try {
      const users = await this.getUsersByTypes(userTypes);

      let allPlayerIds: string[] = [];
      for (const user of users) {
        const playerIds = await TokenModel.getPlayerIdsByUserId(user.id);
        allPlayerIds.push(...(playerIds || []));
      }

      if (allPlayerIds.length === 0) {
        console.warn('⚠️ No valid player IDs found for userTypes:', userTypes);
        return false;
      }

      return await this.sendToPlayers(allPlayerIds, options);
    } catch (error) {
      console.error('❌ Error sending to user types:', error);
      return false;
    }
  }

  /**
   * Create + send notification
   */
  async createAndSendNotification(notificationData: {
    title: string;
    message: string;
    type: NotificationType;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    recipientType: RecipientType;
    recipientIds?: string[];
    data?: Record<string, any>;
    scheduledAt?: Date;
    createdBy: string;
  }): Promise<Notification | null> {
    try {
      const notification = await NotificationModel.create({
        ...notificationData,
        priority: notificationData.priority as any,
      });

      const sendOptions: SendNotificationOptions = {
        title: notificationData.title,
        message: notificationData.message,
        data: {
          ...notificationData.data,
          notificationId: notification.id,
          type: notificationData.type,
        },
        priority: this.mapPriorityToOneSignal(notificationData.priority || 'medium'),
      };

      let success = false;

      switch (notificationData.recipientType) {
        case RecipientType.ALL:
          success = await this.sendToAll(sendOptions);
          break;
        case RecipientType.TEACHERS:
          success = await this.sendToUserTypes([UserType.TEACHER], sendOptions);
          break;
        case RecipientType.STUDENTS:
          success = await this.sendToUserTypes([UserType.STUDENT], sendOptions);
          break;
        case RecipientType.SPECIFIC_TEACHERS:
        case RecipientType.SPECIFIC_STUDENTS:
          if (notificationData.recipientIds?.length) {
            success = await this.sendToSpecificUsers(notificationData.recipientIds, sendOptions);
          }
          break;
      }

      await NotificationModel.updateStatus(
        notification.id,
        success ? NotificationStatus.SENT : NotificationStatus.FAILED,
        success ? { sentAt: new Date() } : {}
      );

      return notification;
    } catch (error) {
      console.error('❌ Error in createAndSendNotification:', error);
      return null;
    }
  }

  /**
   * Send notification using template
   */
  async sendTemplateNotification(
    templateName: string,
    variables: Record<string, any>,
    recipients: NotificationRecipients,
    createdBy: string
  ): Promise<Notification | null> {
    try {
      const template = await this.getNotificationTemplate(templateName);
      if (!template) {
        throw new Error(`Template ${templateName} not found`);
      }

      const title = this.replaceTemplateVariables(template.title_template, variables);
      const message = this.replaceTemplateVariables(template.message_template, variables);

      let recipientType: RecipientType = RecipientType.ALL;
      let recipientIds: string[] | undefined;

      if (recipients.allUsers) {
        recipientType = RecipientType.ALL;
      } else if (recipients.userTypes?.length) {
        if (recipients.userTypes.includes(UserType.TEACHER)) recipientType = RecipientType.TEACHERS;
        if (recipients.userTypes.includes(UserType.STUDENT)) recipientType = RecipientType.STUDENTS;
      } else if (recipients.userIds?.length) {
        recipientIds = recipients.userIds;
        recipientType = RecipientType.SPECIFIC_TEACHERS; // default, adjust based on your needs
      }

      return await this.createAndSendNotification({
        title,
        message,
        type: template.type as NotificationType,
        priority: template.priority as any,
        recipientType,
        ...(recipientIds && { recipientIds }),
        data: variables,
        createdBy,
      });
    } catch (error) {
      console.error('❌ Error sending template notification:', error);
      return null;
    }
  }

  async processPendingNotifications(): Promise<void> {
    try {
      const pendingNotifications = await NotificationModel.getPendingNotifications();

      for (const notification of pendingNotifications) {
        await this.sendPendingNotification(notification);
      }
    } catch (error) {
      console.error('❌ Error processing pending notifications:', error);
    }
  }

  private async sendPendingNotification(notification: Notification): Promise<void> {
    try {
      const sendOptions: SendNotificationOptions = {
        title: notification.title,
        message: notification.message,
        data: {
          ...notification.data,
          notificationId: notification.id,
          type: notification.type,
        },
        priority: this.mapPriorityToOneSignal(notification.priority),
      };

      let success = false;
      switch (notification.recipientType) {
        case RecipientType.ALL:
          success = await this.sendToAll(sendOptions);
          break;
        case RecipientType.TEACHERS:
          success = await this.sendToUserTypes([UserType.TEACHER], sendOptions);
          break;
        case RecipientType.STUDENTS:
          success = await this.sendToUserTypes([UserType.STUDENT], sendOptions);
          break;
        case RecipientType.SPECIFIC_TEACHERS:
        case RecipientType.SPECIFIC_STUDENTS:
          if (notification.recipientIds?.length) {
            success = await this.sendToSpecificUsers(notification.recipientIds, sendOptions);
          }
          break;
      }

      await NotificationModel.updateStatus(
        notification.id,
        success ? NotificationStatus.SENT : NotificationStatus.FAILED,
        success ? { sentAt: new Date() } : {}
      );
    } catch (error) {
      console.error('❌ Error sending pending notification:', error);
      await NotificationModel.updateStatus(notification.id, NotificationStatus.FAILED);
    }
  }

  private async getUsersByTypes(userTypes: UserType[]): Promise<any[]> {
    const allUsers = await UserModel.findAll({ limit: 10000 });
    return allUsers.users.filter((user) => userTypes.includes(user.userType));
  }

  private mapPriorityToOneSignal(priority: string): 'low' | 'normal' | 'high' {
    switch (priority) {
      case 'urgent':
      case 'high':
        return 'high';
      case 'low':
        return 'low';
      default:
        return 'normal';
    }
  }

  private replaceTemplateVariables(template: string, variables: Record<string, any>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, String(value));
    }
    return result;
  }

  private async getNotificationTemplate(templateName: string): Promise<any> {
    const templates: Record<string, any> = {
      homework_reminder: {
        title_template: 'تنبيه واجب منزلي - {{course_name}}',
        message_template:
          'لديك واجب منزلي جديد في مادة {{subject_name}} من المعلم {{teacher_name}}. الموعد النهائي: {{due_date}}',
        type: 'homework_reminder',
        priority: 'high',
      },
      new_booking: {
        title_template: 'حجز جديد - {{course_name}}',
        message_template:
          'لديك حجز جديد من الطالب {{student_name}} في دورة {{course_name}}. {{student_message}}',
        type: 'new_booking',
        priority: 'high',
      },
    };

    return templates[templateName] || null;
  }

  async getNotificationStats(): Promise<any> {
    return await NotificationModel.getStatistics();
  }

  async getUserNotifications(userId: string, page = 1, limit = 10): Promise<any> {
    return await NotificationModel.getUserNotifications(userId, page, limit);
  }

  async markNotificationAsRead(notificationId: string, userId: string): Promise<boolean> {
    return await NotificationModel.markAsRead(notificationId, userId);
  }
}
