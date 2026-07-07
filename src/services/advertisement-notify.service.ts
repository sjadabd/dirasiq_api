import { Client as OneSignalClient } from 'onesignal-node';

import pool from '../config/database';
import {
  NotificationPriority,
  NotificationType,
  RecipientType,
} from '../models/notification.model';
import type { Advertisement } from '../types';
import { logger } from '../utils/logger';
import { RealtimeService } from './realtime.service';
import { getNotificationService } from './services-registry';

let cachedClient: OneSignalClient | null | undefined;

function oneSignal(): OneSignalClient | null {
  if (cachedClient !== undefined) return cachedClient;
  const appId = process.env['ONESIGNAL_APP_ID'];
  const restKey = process.env['ONESIGNAL_REST_API_KEY'];
  if (!appId || !restKey) {
    cachedClient = null;
    return null;
  }
  cachedClient = new OneSignalClient(appId, restKey);
  return cachedClient;
}

/**
 * Inbox row + OneSignal push to a single teacher. Never throws — callers are
 * fire-and-forget lifecycle hooks.
 */
async function notifyTeacher(args: {
  teacherId: string;
  title: string;
  message: string;
  type: NotificationType;
  data?: Record<string, unknown>;
}): Promise<void> {
  const notif = getNotificationService();
  if (!notif) return;

  try {
    await notif.createAndSendNotification({
      title: args.title,
      message: args.message,
      type: args.type,
      priority: NotificationPriority.HIGH,
      recipientType: RecipientType.SPECIFIC_TEACHERS,
      recipientIds: [args.teacherId],
      data: {
        route: '/teacher/advertisements',
        ...args.data,
      },
      createdBy: args.teacherId,
    });
  } catch (err) {
    logger.warn({ err, teacherId: args.teacherId, type: args.type }, 'advertisement teacher notify failed');
  }
}

async function notifyAdmins(title: string, message: string, data?: Record<string, unknown>): Promise<void> {
  try {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE user_type = 'super_admin' AND deleted_at IS NULL AND status = 'active' LIMIT 20`,
    );
    const client = oneSignal();
    if (!client || rows.length === 0) return;
    await client.createNotification({
      headings: { en: title, ar: title },
      contents: { en: message, ar: message },
      include_external_user_ids: rows.map((r) => r.id),
      data: { type: 'advertisement_submitted', route: '/admin/advertisements', ...data },
    });
  } catch (err) {
    logger.warn({ err }, 'advertisement admin notify failed');
  }
}

export class AdvertisementNotifyService {
  static async emitStatusChanged(ad: Advertisement): Promise<void> {
    try {
      await RealtimeService.emitToUser(ad.teacherId, 'advertisement:status_changed', {
        advertisement: {
          id: ad.id,
          status: ad.status,
          budgetRemaining: ad.budgetRemaining,
          uniqueClicks: ad.uniqueClicks,
          updatedAt: ad.updatedAt,
        },
        at: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn({ err, advertisementId: ad.id }, 'advertisement socket emit failed');
    }
  }

  static async onSubmitted(ad: Advertisement, teacherName: string): Promise<void> {
    await notifyAdmins(
      'طلب إعلان جديد',
      `قدّم الأستاذ ${teacherName} إعلاناً بعنوان: ${ad.title}`,
      { advertisementId: ad.id },
    );
  }

  static async onApproved(ad: Advertisement): Promise<void> {
    await notifyTeacher({
      teacherId: ad.teacherId,
      title: 'تمت الموافقة على إعلانك',
      message: `إعلانك "${ad.title}" أصبح جاهزاً للنشر.`,
      type: NotificationType.ADVERTISEMENT_APPROVED,
      data: { advertisementId: ad.id },
    });
  }

  static async onRejected(ad: Advertisement, reason: string): Promise<void> {
    await notifyTeacher({
      teacherId: ad.teacherId,
      title: 'تم رفض إعلانك',
      message: reason || `تم رفض إعلان "${ad.title}" واسترداد الميزانية.`,
      type: NotificationType.ADVERTISEMENT_REJECTED,
      data: { advertisementId: ad.id },
    });
  }

  static async onBudgetExhausted(ad: Advertisement): Promise<void> {
    await this.emitStatusChanged(ad);
    await notifyTeacher({
      teacherId: ad.teacherId,
      title: 'نفدت ميزانية الإعلان',
      message: `إعلان "${ad.title}" توقف لانتهاء الميزانية.`,
      type: NotificationType.ADVERTISEMENT_BUDGET_EXHAUSTED,
      data: { advertisementId: ad.id },
    });
  }

  static async onFinished(ad: Advertisement): Promise<void> {
    await notifyTeacher({
      teacherId: ad.teacherId,
      title: 'انتهى الإعلان',
      message: `انتهت مدة إعلان "${ad.title}".`,
      type: NotificationType.ADVERTISEMENT_FINISHED,
      data: { advertisementId: ad.id },
    });
  }
}
