import type { NextFunction, Request, Response } from 'express';
import path from 'path';

import { AssignmentModel } from '../models/assignment.model';
import {
  NotificationModel,
  NotificationPriority,
  NotificationType,
  RecipientType,
} from '../models/notification.model';
import { NotificationService } from '../services/notification.service';
import { saveBase64File, saveMultipleBase64Images } from '../utils/file.util';
import { ApiError, ErrorCodes } from '../utils/api-error';
import { ok } from '../utils/response.util';
import { parsePagination } from '../utils/pagination';
import { UserType } from '../types';

// One canonical upload directory for all notification attachments. The legacy
// controller had two paths (`/uploads/notification` and `/uploads/notifications`)
// for different handlers; we collapse to the one the teacher-side controller
// already uses in Phase 1.B-1.
const UPLOAD_DIR = path.resolve(__dirname, '..', '..', 'public', 'uploads', 'notification');

const toRelativeUploadPath = (p: string): string => {
  const u = p.replace(/\\/g, '/');
  const i = u.lastIndexOf('/public/');
  if (i !== -1) return u.substring(i + '/public/'.length);
  const j = u.indexOf('uploads/');
  return j !== -1 ? u.substring(j) : u;
};

interface AttachmentsInput {
  pdfBase64?: string;
  imagesBase64?: string[];
}

const persistAttachments = async (
  attachments: AttachmentsInput | undefined,
  existing: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  if (!attachments) return existing;
  let merged: Record<string, unknown> = { ...existing };
  if (attachments.pdfBase64) {
    const pdfPath = await saveBase64File(attachments.pdfBase64, UPLOAD_DIR, 'attachment.pdf');
    merged = {
      ...merged,
      attachments: {
        ...((merged['attachments'] as Record<string, unknown>) || {}),
        pdfUrl: toRelativeUploadPath(pdfPath),
      },
    };
  }
  if (Array.isArray(attachments.imagesBase64) && attachments.imagesBase64.length > 0) {
    const imagePaths = await saveMultipleBase64Images(attachments.imagesBase64, UPLOAD_DIR);
    merged = {
      ...merged,
      attachments: {
        ...((merged['attachments'] as Record<string, unknown>) || {}),
        imageUrls: imagePaths.map(toRelativeUploadPath),
      },
    };
  }
  return merged;
};

export class NotificationController {
  private notificationService: NotificationService;

  constructor() {
    this.notificationService = new NotificationService({
      appId: process.env['ONESIGNAL_APP_ID'] || '',
      restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || '',
    });
  }

  // ---------------------------------------------------------------------------
  // Broadcasts to a recipient class (all / teachers / students).
  // ---------------------------------------------------------------------------

  private sendToRecipientType = async (
    req: Request,
    res: Response,
    recipientType: RecipientType,
    successMessage: string
  ): Promise<void> => {
    const { title, message, type, priority, data, url, imageUrl, attachments } = req.body as {
      title: string;
      message: string;
      type?: NotificationType;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      data?: Record<string, unknown>;
      url?: string;
      imageUrl?: string;
      attachments?: AttachmentsInput;
    };
    const createdBy = req.user.id as string;

    const enrichedData = await persistAttachments(attachments, { ...(data ?? {}) });

    const notification = await this.notificationService.createAndSendNotification({
      title,
      message,
      type: type || NotificationType.SYSTEM_ANNOUNCEMENT,
      priority: priority || NotificationPriority.MEDIUM,
      recipientType,
      data: { ...enrichedData, url, imageUrl },
      createdBy,
    });

    if (!notification) {
      throw new ApiError(500, 'فشل في إرسال الإشعار', ErrorCodes.INTERNAL_ERROR);
    }

    res.status(201).json(ok(notification, successMessage));
  };

  sendToAll = async (req: Request, res: Response): Promise<void> => {
    await this.sendToRecipientType(req, res, RecipientType.ALL, 'تم إرسال الإشعار للجميع');
  };

  sendToTeachers = async (req: Request, res: Response): Promise<void> => {
    await this.sendToRecipientType(req, res, RecipientType.TEACHERS, 'تم إرسال الإشعار للمعلمين');
  };

  sendToStudents = async (req: Request, res: Response): Promise<void> => {
    await this.sendToRecipientType(req, res, RecipientType.STUDENTS, 'تم إرسال الإشعار للطلاب');
  };

  // ---------------------------------------------------------------------------
  // POST /api/notifications/send-to-specific
  // ---------------------------------------------------------------------------
  sendToSpecificUsers = async (req: Request, res: Response): Promise<void> => {
    const {
      title,
      message,
      type,
      priority,
      recipientIds,
      recipientType,
      data,
      url,
      imageUrl,
      attachments,
    } = req.body as {
      title: string;
      message: string;
      type?: NotificationType;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      recipientIds: string[];
      recipientType?: RecipientType;
      data?: Record<string, unknown>;
      url?: string;
      imageUrl?: string;
      attachments?: AttachmentsInput;
    };
    const createdBy = req.user.id as string;

    const enrichedData = await persistAttachments(attachments, { ...(data ?? {}) });

    const notification = await this.notificationService.createAndSendNotification({
      title,
      message,
      type: type || NotificationType.SYSTEM_ANNOUNCEMENT,
      priority: priority || NotificationPriority.MEDIUM,
      recipientType: recipientType || RecipientType.SPECIFIC_TEACHERS,
      recipientIds,
      data: { ...enrichedData, url, imageUrl },
      createdBy,
    });

    if (!notification) {
      throw new ApiError(500, 'فشل في إرسال الإشعار', ErrorCodes.INTERNAL_ERROR);
    }
    res.status(201).json(ok(notification, 'تم إرسال الإشعار للمستلمين المحددين'));
  };

  // ---------------------------------------------------------------------------
  // POST /api/notifications/send-template
  // ---------------------------------------------------------------------------
  sendTemplateNotification = async (req: Request, res: Response): Promise<void> => {
    const { templateName, variables, recipients } = req.body as {
      templateName: string;
      variables: Record<string, unknown>;
      recipients: Record<string, unknown>;
    };
    const createdBy = req.user.id as string;

    const notification = await this.notificationService.sendTemplateNotification(
      templateName,
      variables,
      recipients,
      createdBy
    );
    if (!notification) {
      throw new ApiError(500, 'فشل في إرسال إشعار القالب', ErrorCodes.INTERNAL_ERROR);
    }
    res.status(201).json(ok(notification, 'تم إرسال إشعار القالب'));
  };

  // ---------------------------------------------------------------------------
  // GET /api/notifications  (super-admin)
  // ---------------------------------------------------------------------------
  getNotifications = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as unknown as {
      page?: number;
      limit?: number;
      type?: NotificationType;
      status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
      priority?: NotificationPriority;
      recipientType?: RecipientType;
      createdBy?: string;
      dateFrom?: string;
      dateTo?: string;
    };
    const { page, limit } = parsePagination(query);

    const filters: Record<string, unknown> = { page, limit };
    if (query.type) filters['type'] = query.type;
    if (query.status) filters['status'] = query.status;
    if (query.priority) filters['priority'] = query.priority;
    if (query.recipientType) filters['recipientType'] = query.recipientType;
    if (query.createdBy) filters['createdBy'] = query.createdBy;
    if (query.dateFrom) filters['dateFrom'] = new Date(query.dateFrom);
    if (query.dateTo) filters['dateTo'] = new Date(query.dateTo);

    const result = await NotificationModel.findMany(filters);
    res.status(200).json(ok(result, 'قائمة الإشعارات'));
  };

  // ---------------------------------------------------------------------------
  // GET /api/notifications/:id
  // ---------------------------------------------------------------------------
  getNotificationById = async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string;
    const notification = await NotificationModel.findById(id);
    if (!notification) {
      throw new ApiError(404, 'الإشعار غير موجود', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(ok(notification, 'تفاصيل الإشعار'));
  };

  // ---------------------------------------------------------------------------
  // GET /api/notifications/user/my-notifications
  // ---------------------------------------------------------------------------
  getUserNotifications = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user.id as string;
    const query = req.query as unknown as {
      page?: number;
      limit?: number;
      q?: string;
      type?: NotificationType;
      courseId?: string;
      subType?: string;
    };
    const { page, limit } = parsePagination(query);

    const parsedType =
      query.type && Object.values(NotificationType).includes(query.type) ? query.type : null;

    const result = await this.notificationService.getUserNotifications(userId, page, limit, {
      q: query.q ?? null,
      type: parsedType,
      courseId: query.courseId ?? null,
      subType: query.subType ?? null,
    });

    // Normalize attachments and links to absolute URLs for client display.
    const toAbsolute = (p?: string | null): string | null => {
      if (!p) return p ?? null;
      const prefixed = p.startsWith('/') ? p : `/${p}`;
      return `${req.protocol}://${req.get('host')}${prefixed}`;
    };
    const isAbsoluteUrl = (u?: string): boolean => !!u && /^(https?:)?\/\//i.test(u);

    const rawList: any[] = (result.notifications || result.data || []) as any[];
    const notifications = await Promise.all(
      rawList.map(async (n) => {
        const data = n.data || {};
        let attachments = data.attachments || {};

        if (n.type === NotificationType.ASSIGNMENT_DUE || n.type === 'assignment_due') {
          const assignmentId = data.assignmentId || data.assignment_id;
          const hasFiles =
            attachments && Array.isArray(attachments.files) && attachments.files.length > 0;
          if (assignmentId && !hasFiles) {
            try {
              const assignment = await AssignmentModel.getById(String(assignmentId));
              if (assignment?.attachments) {
                attachments = { ...(attachments || {}), ...assignment.attachments };
              }
            } catch {
              /* enrichment is best-effort */
            }
          }
        }

        const link = data.link && !isAbsoluteUrl(data.link) ? toAbsolute(String(data.link)) : data.link;
        const url = data.url && !isAbsoluteUrl(data.url) ? toAbsolute(String(data.url)) : data.url;
        const imageUrl =
          data.imageUrl && !isAbsoluteUrl(data.imageUrl) ? toAbsolute(String(data.imageUrl)) : data.imageUrl;

        const pdfUrl = attachments?.pdfUrl ? toAbsolute(attachments.pdfUrl) : undefined;
        const imageUrls = Array.isArray(attachments?.imageUrls)
          ? attachments.imageUrls.map((u: string) => toAbsolute(u))
          : undefined;
        const files = Array.isArray(attachments?.files)
          ? attachments.files.map((f: any) => ({
              ...f,
              url: typeof f?.url === 'string' && !isAbsoluteUrl(f.url) ? toAbsolute(f.url) : f?.url,
            }))
          : undefined;

        return {
          ...n,
          data: {
            ...data,
            ...(link ? { link } : {}),
            ...(url ? { url } : {}),
            ...(imageUrl ? { imageUrl } : {}),
            attachments: {
              ...(attachments || {}),
              ...(pdfUrl ? { pdfUrl } : {}),
              ...(imageUrls ? { imageUrls } : {}),
              ...(files ? { files } : {}),
            },
          },
        };
      })
    );

    res.status(200).json(ok({ ...result, notifications }, 'إشعاراتي'));
  };

  // ---------------------------------------------------------------------------
  // PUT /api/notifications/:id/read
  // ---------------------------------------------------------------------------
  markAsRead = async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string;
    const userId = req.user.id as string;
    const success = await this.notificationService.markNotificationAsRead(id, userId);
    if (!success) {
      throw new ApiError(
        404,
        'الإشعار غير موجود أو تم تعليمه كمقروء مسبقاً',
        ErrorCodes.NOT_FOUND
      );
    }
    res.status(200).json(ok(null, 'تم تعليم الإشعار كمقروء'));
  };

  // ---------------------------------------------------------------------------
  // PUT /api/notifications/user/mark-all-read
  // ---------------------------------------------------------------------------
  markAllAsRead = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user.id as string;
    const marked = await this.notificationService.markAllNotificationsAsRead(userId);
    res.status(200).json(ok({ marked }, 'تم تعليم كل الإشعارات كمقروءة'));
  };

  // ---------------------------------------------------------------------------
  // GET /api/notifications/statistics  (super-admin)
  // ---------------------------------------------------------------------------
  getStatistics = async (_req: Request, res: Response): Promise<void> => {
    const stats = await this.notificationService.getNotificationStats();
    res.status(200).json(ok(stats, 'إحصائيات الإشعارات'));
  };

  // ---------------------------------------------------------------------------
  // POST /api/notifications/process-pending  (super-admin)
  // ---------------------------------------------------------------------------
  processPendingNotifications = async (_req: Request, res: Response): Promise<void> => {
    await this.notificationService.processPendingNotifications();
    res.status(200).json(ok(null, 'تم تشغيل معالجة الإشعارات المعلقة'));
  };

  // ---------------------------------------------------------------------------
  // DELETE /api/notifications/:id  (super-admin)
  // ---------------------------------------------------------------------------
  deleteNotification = async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string;
    const success = await NotificationModel.delete(id);
    if (!success) {
      throw new ApiError(404, 'الإشعار غير موجود', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(ok(null, 'تم حذف الإشعار'));
  };

  // ---------------------------------------------------------------------------
  // Reused by other controllers (news, course, etc.) — keeps the legacy
  // internal API. Returns the underlying notification or null.
  // ---------------------------------------------------------------------------
  createAndSendNotification = async (notificationData: {
    title: string;
    message: string;
    type: NotificationType;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    recipientType: RecipientType;
    recipientIds?: string[];
    data?: Record<string, unknown>;
    scheduledAt?: Date;
    createdBy: string;
  }): Promise<unknown> => this.notificationService.createAndSendNotification(notificationData);
}

// Per-endpoint role gates. Phase 1 idiom: throw `ApiError` with a stable code
// instead of writing the response. The global error middleware formats it.
export const allowAdminOrTeacher = (req: Request, _res: Response, next: NextFunction): void => {
  const userType = req.user?.userType;
  if (userType === UserType.SUPER_ADMIN || userType === UserType.TEACHER) {
    return next();
  }
  next(
    new ApiError(
      403,
      'الوصول مرفوض. هذا الإجراء مسموح للمسؤولين والمعلمين فقط',
      ErrorCodes.ROLE_REQUIRED
    )
  );
};

export const allowAdminOnly = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.user?.userType === UserType.SUPER_ADMIN) {
    return next();
  }
  next(
    new ApiError(403, 'الوصول مرفوض. هذا الإجراء مسموح للمسؤولين فقط', ErrorCodes.ROLE_REQUIRED)
  );
};

// Compatibility shim: any importer of the legacy `notificationValidation`
// object now gets an empty object. The new route file uses Zod schemas from
// `src/schemas/notification.schemas.ts` directly.
export const notificationValidation = {};
