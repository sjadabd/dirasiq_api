import { NotificationModel, NotificationPriority, NotificationType, RecipientType } from '@/models/notification.model';
import { NotificationService } from '@/services/notification.service';
import { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import path from 'path';
import { saveBase64File, saveMultipleBase64Images } from '../utils/file.util';

export class NotificationController {
  private notificationService: NotificationService;

  constructor() {
    // Initialize OneSignal configuration from environment variables
    const oneSignalConfig = {
      appId: process.env['ONESIGNAL_APP_ID'] || '',
      restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || ''
    };

    this.notificationService = new NotificationService(oneSignalConfig);
  }

  /**
   * Send notification to all users
   */
  sendToAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
        return;
      }

      const { title, message, type, priority, data, url, imageUrl, attachments } = req.body;
      const createdBy = (req as any).user?.id;

      if (!createdBy) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
        return;
      }

      // Save attachments if provided
      let enrichedData: Record<string, any> = { ...(data || {}) };
      if (attachments?.pdfBase64 || (Array.isArray(attachments?.imagesBase64) && attachments.imagesBase64.length)) {
        const baseDir = path.resolve(__dirname, '..', '..', 'public', 'uploads', 'notification');
        const toRelative = (p: string) => {
          const u = p.replace(/\\/g, '/');
          const i = u.lastIndexOf('/public/');
          if (i !== -1) return u.substring(i + '/public/'.length);
          const j = u.indexOf('uploads/');
          return j !== -1 ? u.substring(j) : u;
        };
        if (attachments?.pdfBase64) {
          const pdfPath = await saveBase64File(attachments.pdfBase64, baseDir, 'attachment.pdf');
          enrichedData['attachments'] = { ...((enrichedData as any)['attachments'] || {}), pdfUrl: toRelative(pdfPath) };
        }
        if (Array.isArray(attachments?.imagesBase64) && attachments.imagesBase64.length > 0) {
          const imagePaths = await saveMultipleBase64Images(attachments.imagesBase64, baseDir);
          enrichedData['attachments'] = {
            ...((enrichedData as any)['attachments'] || {}),
            imageUrls: imagePaths.map(toRelative),
          };
        }
      }

      const notification = await this.notificationService.createAndSendNotification({
        title,
        message,
        type: type || NotificationType.SYSTEM_ANNOUNCEMENT,
        priority: priority || NotificationPriority.MEDIUM,
        recipientType: RecipientType.ALL,
        data: {
          ...enrichedData,
          url,
          imageUrl
        },
        createdBy
      });

      if (notification) {
        res.status(201).json({
          success: true,
          message: 'Notification sent successfully',
          data: notification
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to send notification'
        });
      }
    } catch (error) {
      console.error('Error in sendToAll:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };

  /**
   * Send notification to teachers
   */
  sendToTeachers = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
        return;
      }

      const { title, message, type, priority, data, url, imageUrl, attachments } = req.body;
      const createdBy = (req as any).user?.id;

      if (!createdBy) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
        return;
      }

      // Save attachments if provided
      let enrichedData: Record<string, any> = { ...(data || {}) };
      if (attachments?.pdfBase64 || (Array.isArray(attachments?.imagesBase64) && attachments.imagesBase64.length)) {
        const baseDir = path.join(__dirname, '../../public/uploads/notifications');
        const toRelative = (p: string) => {
          const u = p.replace(/\\/g, '/');
          const i = u.lastIndexOf('/public/');
          if (i !== -1) return u.substring(i + '/public/'.length);
          const j = u.indexOf('uploads/');
          return j !== -1 ? u.substring(j) : u;
        };
        if (attachments?.pdfBase64) {
          const pdfPath = await saveBase64File(attachments.pdfBase64, baseDir, 'attachment.pdf');
          enrichedData['attachments'] = { ...((enrichedData as any)['attachments'] || {}), pdfUrl: toRelative(pdfPath) };
        }
        if (Array.isArray(attachments?.imagesBase64) && attachments.imagesBase64.length > 0) {
          const imagePaths = await saveMultipleBase64Images(attachments.imagesBase64, baseDir);
          enrichedData['attachments'] = {
            ...((enrichedData as any)['attachments'] || {}),
            imageUrls: imagePaths.map(toRelative),
          };
        }
      }

      const notification = await this.notificationService.createAndSendNotification({
        title,
        message,
        type: type || NotificationType.SYSTEM_ANNOUNCEMENT,
        priority: priority || NotificationPriority.MEDIUM,
        recipientType: RecipientType.TEACHERS,
        data: {
          ...enrichedData,
          url,
          imageUrl
        },
        createdBy
      });

      if (notification) {
        res.status(201).json({
          success: true,
          message: 'Notification sent to teachers successfully',
          data: notification
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to send notification to teachers'
        });
      }
    } catch (error) {
      console.error('Error in sendToTeachers:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };

  /**
   * Send notification to students
   */
  sendToStudents = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
        return;
      }

      const { title, message, type, priority, data, url, imageUrl, attachments } = req.body;
      const createdBy = (req as any).user?.id;

      if (!createdBy) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
        return;
      }

      // Save attachments if provided
      let enrichedData: Record<string, any> = { ...(data || {}) };
      if (attachments?.pdfBase64 || (Array.isArray(attachments?.imagesBase64) && attachments.imagesBase64.length)) {
        const baseDir = path.join(__dirname, '../../public/uploads/notifications');
        const toRelative = (p: string) => {
          const u = p.replace(/\\/g, '/');
          const i = u.lastIndexOf('/public/');
          if (i !== -1) return u.substring(i + '/public/'.length);
          const j = u.indexOf('uploads/');
          return j !== -1 ? u.substring(j) : u;
        };
        if (attachments?.pdfBase64) {
          const pdfPath = await saveBase64File(attachments.pdfBase64, baseDir, 'attachment.pdf');
          enrichedData['attachments'] = { ...((enrichedData as any)['attachments'] || {}), pdfUrl: toRelative(pdfPath) };
        }
        if (Array.isArray(attachments?.imagesBase64) && attachments.imagesBase64.length > 0) {
          const imagePaths = await saveMultipleBase64Images(attachments.imagesBase64, baseDir);
          enrichedData['attachments'] = {
            ...((enrichedData as any)['attachments'] || {}),
            imageUrls: imagePaths.map(toRelative),
          };
        }
      }

      const notification = await this.notificationService.createAndSendNotification({
        title,
        message,
        type: type || NotificationType.SYSTEM_ANNOUNCEMENT,
        priority: priority || NotificationPriority.MEDIUM,
        recipientType: RecipientType.STUDENTS,
        data: {
          ...enrichedData,
          url,
          imageUrl
        },
        createdBy
      });

      if (notification) {
        res.status(201).json({
          success: true,
          message: 'Notification sent to students successfully',
          data: notification
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to send notification to students'
        });
      }
    } catch (error) {
      console.error('Error in sendToStudents:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };

  /**
   * Send notification to specific users
   */
  sendToSpecificUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
        return;
      }

      const { title, message, type, priority, recipientIds, recipientType, data, url, imageUrl, attachments } = req.body;
      const createdBy = (req as any).user?.id;

      if (!createdBy) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
        return;
      }

      if (!recipientIds || recipientIds.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Recipient IDs are required'
        });
        return;
      }

      // Save attachments if provided
      let enrichedData: Record<string, any> = { ...(data || {}) };
      if (attachments?.pdfBase64 || (Array.isArray(attachments?.imagesBase64) && attachments.imagesBase64.length)) {
        const baseDir = path.join(__dirname, '../../public/uploads/notifications');
        const toRelative = (p: string) => {
          const u = p.replace(/\\/g, '/');
          const i = u.lastIndexOf('/public/');
          if (i !== -1) return u.substring(i + '/public/'.length);
          const j = u.indexOf('uploads/');
          return j !== -1 ? u.substring(j) : u;
        };
        if (attachments?.pdfBase64) {
          const pdfPath = await saveBase64File(attachments.pdfBase64, baseDir, 'attachment.pdf');
          enrichedData['attachments'] = { ...((enrichedData as any)['attachments'] || {}), pdfUrl: toRelative(pdfPath) };
        }
        if (Array.isArray(attachments?.imagesBase64) && attachments.imagesBase64.length > 0) {
          const imagePaths = await saveMultipleBase64Images(attachments.imagesBase64, baseDir);
          enrichedData['attachments'] = {
            ...((enrichedData as any)['attachments'] || {}),
            imageUrls: imagePaths.map(toRelative),
          };
        }
      }

      const notification = await this.notificationService.createAndSendNotification({
        title,
        message,
        type: type || NotificationType.SYSTEM_ANNOUNCEMENT,
        priority: priority || NotificationPriority.MEDIUM,
        recipientType: recipientType || RecipientType.SPECIFIC_TEACHERS,
        recipientIds,
        data: {
          ...enrichedData,
          url,
          imageUrl
        },
        createdBy
      });

      if (notification) {
        res.status(201).json({
          success: true,
          message: 'Notification sent to specific users successfully',
          data: notification
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to send notification to specific users'
        });
      }
    } catch (error) {
      console.error('Error in sendToSpecificUsers:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };

  /**
   * Send notification using template
   */
  sendTemplateNotification = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
        return;
      }

      const { templateName, variables, recipients } = req.body;
      const createdBy = (req as any).user?.id;

      if (!createdBy) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
        return;
      }

      const notification = await this.notificationService.sendTemplateNotification(
        templateName,
        variables,
        recipients,
        createdBy
      );

      if (notification) {
        res.status(201).json({
          success: true,
          message: 'Template notification sent successfully',
          data: notification
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to send template notification'
        });
      }
    } catch (error) {
      console.error('Error in sendTemplateNotification:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };

  /**
   * Get all notifications with filters
   */
  getNotifications = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        type,
        status,
        priority,
        recipientType,
        createdBy,
        dateFrom,
        dateTo,
        page = 1,
        limit = 10
      } = req.query;

      const filters: any = {
        type: type as NotificationType,
        status: status as any,
        priority: priority as NotificationPriority,
        recipientType: recipientType as RecipientType,
        createdBy: createdBy as string,
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      };

      if (dateFrom) {
        filters.dateFrom = new Date(dateFrom as string);
      }

      if (dateTo) {
        filters.dateTo = new Date(dateTo as string);
      }

      const result = await NotificationModel.findMany(filters);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error in getNotifications:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };

  /**
   * Get notification by ID
   */
  getNotificationById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Notification ID is required'
        });
        return;
      }

      const notification = await NotificationModel.findById(id);

      if (!notification) {
        res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: notification
      });
    } catch (error) {
      console.error('Error in getNotificationById:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };

  /**
   * Get user's notifications
   */
  getUserNotifications = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      const { page = 1, limit = 10, q, type, courseId, subType } = req.query as any;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
        return;
      }

      const parsedType = type && Object.values(NotificationType).includes(type as NotificationType)
        ? (type as NotificationType)
        : null;

      const result = await this.notificationService.getUserNotifications(userId, parseInt(page as string), parseInt(limit as string), {
        q: q ? String(q) : null,
        type: parsedType,
        courseId: courseId ? String(courseId) : null,
        subType: subType ? String(subType) : null,
      });

      // Normalize attachments and links to absolute URLs for client display
      const toAbsolute = (p?: string | null) => {
        if (!p) return p;
        const path = p.startsWith('/') ? p : `/${p}`;
        return `${req.protocol}://${req.get('host')}${path}`;
      };
      const isAbsoluteUrl = (u?: string) => !!u && /^(https?:)?\/\//i.test(u);

      const notifications = (result.notifications || result.data || []).map((n: any) => {
        const data = n.data || {};
        const attachments = data.attachments || {};
        const pdfUrl = attachments.pdfUrl ? toAbsolute(attachments.pdfUrl) : undefined;
        const imageUrls = Array.isArray(attachments.imageUrls)
          ? attachments.imageUrls.map((u: string) => toAbsolute(u))
          : undefined;
        const link = data.link && !isAbsoluteUrl(data.link) ? toAbsolute(String(data.link)) : data.link;
        return {
          ...n,
          data: {
            ...data,
            ...(link ? { link } : {}),
            attachments: {
              ...attachments,
              ...(pdfUrl ? { pdfUrl } : {}),
              ...(imageUrls ? { imageUrls } : {}),
            },
          },
        };
      });

      const modified = {
        ...result,
        notifications,
      };

      res.status(200).json({
        success: true,
        data: modified
      });
    } catch (error) {
      console.error('Error in getUserNotifications:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };

  /**
   * Create and send notification (internal method)
   */
  createAndSendNotification = async (notificationData: {
    title: string;
    message: string;
    type: NotificationType;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    recipientType: RecipientType;
    recipientIds?: string[];
    data?: Record<string, any>;
    scheduledAt?: Date;
    createdBy: string;
  }): Promise<any> => {
    return await this.notificationService.createAndSendNotification(notificationData);
  };

  /**
   * Mark notification as read
   */
  markAsRead = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Notification ID is required'
        });
        return;
      }

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
        return;
      }

      const success = await this.notificationService.markNotificationAsRead(id, userId);

      if (success) {
        res.status(200).json({
          success: true,
          message: 'Notification marked as read'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Notification not found or already marked as read'
        });
      }
    } catch (error) {
      console.error('Error in markAsRead:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };

  /**
   * Get notification statistics
   */
  getStatistics = async (_req: Request, res: Response): Promise<void> => {
    try {
      const stats = await this.notificationService.getNotificationStats();

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error in getStatistics:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };

  /**
   * Process pending notifications (admin only)
   */
  processPendingNotifications = async (_req: Request, res: Response): Promise<void> => {
    try {
      await this.notificationService.processPendingNotifications();

      res.status(200).json({
        success: true,
        message: 'Pending notifications processed successfully'
      });
    } catch (error) {
      console.error('Error in processPendingNotifications:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };

  /**
   * Delete notification
   */
  deleteNotification = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Notification ID is required'
        });
        return;
      }

      const success = await NotificationModel.delete(id);

      if (success) {
        res.status(200).json({
          success: true,
          message: 'Notification deleted successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }
    } catch (error) {
      console.error('Error in deleteNotification:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };
}

// Validation rules
export const notificationValidation = {
  sendNotification: [
    body('title').notEmpty().withMessage('Title is required').isLength({ max: 255 }).withMessage('Title too long'),
    body('message').notEmpty().withMessage('Message is required'),
    body('type').optional().isIn(Object.values(NotificationType)).withMessage('Invalid notification type'),
    body('priority').optional().isIn(Object.values(NotificationPriority)).withMessage('Invalid priority'),
    body('data').optional().isObject().withMessage('Data must be an object'),
    body('url').optional().isURL().withMessage('Invalid URL'),
    body('imageUrl').optional().isURL().withMessage('Invalid image URL')
  ],

  sendToSpecificUsers: [
    body('title').notEmpty().withMessage('Title is required').isLength({ max: 255 }).withMessage('Title too long'),
    body('message').notEmpty().withMessage('Message is required'),
    body('recipientIds').isArray({ min: 1 }).withMessage('At least one recipient ID is required'),
    body('recipientIds.*').isUUID().withMessage('Invalid recipient ID format'),
    body('type').optional().isIn(Object.values(NotificationType)).withMessage('Invalid notification type'),
    body('priority').optional().isIn(Object.values(NotificationPriority)).withMessage('Invalid priority'),
    body('recipientType').optional().isIn([RecipientType.SPECIFIC_TEACHERS, RecipientType.SPECIFIC_STUDENTS]).withMessage('Invalid recipient type'),
    body('data').optional().isObject().withMessage('Data must be an object'),
    body('url').optional().isURL().withMessage('Invalid URL'),
    body('imageUrl').optional().isURL().withMessage('Invalid image URL')
  ],

  sendTemplateNotification: [
    body('templateName').notEmpty().withMessage('Template name is required'),
    body('variables').isObject().withMessage('Variables must be an object'),
    body('recipients').isObject().withMessage('Recipients must be an object'),
    body('recipients.userIds').optional().isArray().withMessage('User IDs must be an array'),
    body('recipients.userTypes').optional().isArray().withMessage('User types must be an array'),
    body('recipients.allUsers').optional().isBoolean().withMessage('All users must be a boolean')
  ],

  getNotifications: [
    query('type').optional().isIn(Object.values(NotificationType)).withMessage('Invalid notification type'),
    query('status').optional().isIn(['pending', 'sent', 'delivered', 'read', 'failed']).withMessage('Invalid status'),
    query('priority').optional().isIn(Object.values(NotificationPriority)).withMessage('Invalid priority'),
    query('recipientType').optional().isIn(Object.values(RecipientType)).withMessage('Invalid recipient type'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('dateFrom').optional().isISO8601().withMessage('Invalid date format'),
    query('dateTo').optional().isISO8601().withMessage('Invalid date format')
  ],

  getNotificationById: [
    param('id').isUUID().withMessage('Invalid notification ID')
  ],

  markAsRead: [
    param('id').isUUID().withMessage('Invalid notification ID')
  ],

  deleteNotification: [
    param('id').isUUID().withMessage('Invalid notification ID')
  ]
};
