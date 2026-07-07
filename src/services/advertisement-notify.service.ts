import { Client as OneSignalClient } from 'onesignal-node';

import pool from '../config/database';
import type { Advertisement } from '../types';
import { logger } from '../utils/logger';

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

async function notifyUser(args: {
  userId: string;
  title: string;
  message: string;
  type: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    const client = oneSignal();
    if (client) {
      await client.createNotification({
        headings: { en: args.title, ar: args.title },
        contents: { en: args.message, ar: args.message },
        include_external_user_ids: [args.userId],
        data: { type: args.type, route: '/teacher/advertisements', ...args.data },
      });
    }
  } catch (err) {
    logger.warn({ err, userId: args.userId }, 'advertisement notify push failed');
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
  static async onSubmitted(ad: Advertisement, teacherName: string): Promise<void> {
    await notifyAdmins(
      'طلب إعلان جديد',
      `قدّم الأستاذ ${teacherName} إعلاناً بعنوان: ${ad.title}`,
      { advertisementId: ad.id },
    );
  }

  static async onApproved(ad: Advertisement): Promise<void> {
    await notifyUser({
      userId: ad.teacherId,
      title: 'تمت الموافقة على إعلانك',
      message: `إعلانك "${ad.title}" أصبح جاهزاً للنشر.`,
      type: 'advertisement_approved',
      data: { advertisementId: ad.id },
    });
  }

  static async onRejected(ad: Advertisement, reason: string): Promise<void> {
    await notifyUser({
      userId: ad.teacherId,
      title: 'تم رفض إعلانك',
      message: reason || `تم رفض إعلان "${ad.title}" واسترداد الميزانية.`,
      type: 'advertisement_rejected',
      data: { advertisementId: ad.id },
    });
  }

  static async onBudgetExhausted(ad: Advertisement): Promise<void> {
    await notifyUser({
      userId: ad.teacherId,
      title: 'نفدت ميزانية الإعلان',
      message: `إعلان "${ad.title}" توقف لانتهاء الميزانية.`,
      type: 'advertisement_budget_exhausted',
      data: { advertisementId: ad.id },
    });
  }

  static async onFinished(ad: Advertisement): Promise<void> {
    await notifyUser({
      userId: ad.teacherId,
      title: 'انتهى الإعلان',
      message: `انتهت مدة إعلان "${ad.title}".`,
      type: 'advertisement_finished',
      data: { advertisementId: ad.id },
    });
  }
}
