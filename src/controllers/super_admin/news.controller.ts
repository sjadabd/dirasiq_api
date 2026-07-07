import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

import pool from '../../config/database';
import { NewsService } from '../../services/news.service';
import { type CreateNewsRequest, NewsType, type UpdateNewsRequest } from '../../types';
import { NotificationController } from '../notification.controller';
import { NotificationType } from '../../models/notification.model';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { expandNewsTypeListFilter, recipientTypeForNews } from '../../utils/news-targeting.util';
import { ok } from '../../utils/response.util';

const UPLOAD_DIR = path.resolve(process.cwd(), 'public', 'uploads', 'news');

// Strict allowlist: raster formats the Flutter app's `Image.network` can decode
// on Android (which uses platform ImageDecoder). SVG / GIF / BMP are rejected
// because Flutter renders them only via extra packages (flutter_svg, etc.) and
// we don't want to ship those for a marketing-grade asset path.
const ALLOWED_IMAGE_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const ALLOWED_IMAGE_LABEL = 'JPG, PNG, أو WEBP';

// ~6 MB after base64 decoding. Marketing-grade news images shouldn't need more.
const MAX_NEWS_IMAGE_BYTES = 6 * 1024 * 1024;

const saveBase64Image = async (base64Data: string): Promise<string> => {
  const matches = base64Data.match(/^data:(image\/[-+\w.]+);base64,(.+)$/i);
  if (!matches) {
    throw new ApiError(400, 'بيانات الصورة غير صحيحة', ErrorCodes.VALIDATION_ERROR);
  }
  const mimeType = (matches[1] as string).toLowerCase();
  const base64String = matches[2] as string;
  const ext = ALLOWED_IMAGE_MIME_TO_EXT[mimeType];
  if (!ext) {
    throw new ApiError(
      400,
      `صيغة الصورة غير مدعومة. الصيغ المسموح بها: ${ALLOWED_IMAGE_LABEL}.`,
      ErrorCodes.VALIDATION_ERROR,
      { fields: [{ field: 'body.imageUrl', message: `صيغة الصورة غير مدعومة (${mimeType}).`, code: 'unsupported_image_format' }] }
    );
  }
  const buffer = Buffer.from(base64String, 'base64');
  if (buffer.byteLength > MAX_NEWS_IMAGE_BYTES) {
    throw new ApiError(
      400,
      `حجم الصورة كبير جداً. الحد الأقصى ${(MAX_NEWS_IMAGE_BYTES / (1024 * 1024)).toFixed(0)} ميغابايت.`,
      ErrorCodes.VALIDATION_ERROR,
      { fields: [{ field: 'body.imageUrl', message: 'حجم الصورة يتجاوز الحد المسموح.', code: 'image_too_large' }] }
    );
  }
  const fileName = `news_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
  const filePath = path.join(UPLOAD_DIR, fileName);
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.promises.writeFile(filePath, buffer);
  return `/uploads/news/${fileName}`;
};

const deleteLocalImageIfExists = async (publicPath: string | null | undefined): Promise<void> => {
  if (!publicPath || typeof publicPath !== 'string') return;
  if (!publicPath.startsWith('/uploads/news/')) return;
  try {
    const fileOnDisk = path.resolve(process.cwd(), 'public', publicPath.replace(/^\//, ''));
    await fs.promises.unlink(fileOnDisk).catch(() => undefined);
  } catch {
    /* ignore */
  }
};

export class NewsController {
  // POST /api/news
  static async create(req: Request, res: Response): Promise<void> {
    const data = { ...(req.body as CreateNewsRequest) };

    if (data.imageUrl && typeof data.imageUrl === 'string' && data.imageUrl.startsWith('data:image')) {
      data.imageUrl = await saveBase64Image(data.imageUrl);
    }

    const news = await NewsService.createNews(data);

    // Fire-and-forget notification fan-out by news type. Never blocks success.
    try {
      const notif = new NotificationController();
      const createdBy = (req.user?.id as string | undefined) || 'system';
      await notif.createAndSendNotification({
        title: '📰 خبر جديد!',
        message: data.title || 'تمت إضافة خبر جديد في المنصة',
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
        priority: 'medium',
        recipientType: recipientTypeForNews(data.newsType),
        data: {
          newsId: news.id,
          newsType: data.newsType,
          url: `/news/${news.id}`,
          imageUrl: news.imageUrl,
        },
        createdBy,
      });
    } catch (err) {
      req.log?.warn({ err }, 'news creation notification failed');
    }

    res.status(201).json(ok(news, 'تم إنشاء الخبر بنجاح'));
  }

  // GET /api/news/:id
  static async getById(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const news = await NewsService.getNewsById(id);
    if (!news) {
      throw new ApiError(404, 'الخبر غير موجود', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(ok(news, 'تفاصيل الخبر'));
  }

  // GET /api/news
  static async getAll(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as {
      page?: number;
      limit?: number;
      search?: string;
      isActive?: boolean;
      newsType?: NewsType;
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    let newsTypes: NewsType[] | undefined;
    if (query.newsType) {
      newsTypes = expandNewsTypeListFilter(query.newsType);
    }

    const result = await NewsService.getAllNews(page, limit, query.search, query.isActive, newsTypes);
    // Preserve the legacy contract — the dashboard reads `data: <result>` with
    // its own pagination object inside.
    res.status(200).json(ok(result, 'قائمة الأخبار'));
  }

  // PUT /api/news/:id
  static async update(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const data = { ...(req.body as UpdateNewsRequest) };

    let imageChanged = false;
    if (data.imageUrl && typeof data.imageUrl === 'string' && data.imageUrl.startsWith('data:image')) {
      const current = await NewsService.getNewsById(id);
      if (!current) {
        throw new ApiError(404, 'الخبر غير موجود', ErrorCodes.NOT_FOUND);
      }
      if (current.imageUrl) {
        await deleteLocalImageIfExists(current.imageUrl);
      }
      data.imageUrl = await saveBase64Image(data.imageUrl);
      imageChanged = true;
    }

    const news = await NewsService.updateNews(id, data);
    if (!news) {
      throw new ApiError(404, 'الخبر غير موجود', ErrorCodes.NOT_FOUND);
    }

    // Keep the snapshot in already-sent notifications pointing at the new
    // image. Without this, the old file gets deleted above but the
    // notifications still link to it → 404 in the bell drawer for every
    // teacher who already received the announcement.
    if (imageChanged && news.imageUrl) {
      try {
        await pool.query(
          `UPDATE notifications
              SET data = jsonb_set(
                COALESCE(data::jsonb, '{}'::jsonb),
                '{imageUrl}',
                to_jsonb($1::text),
                true
              )
            WHERE data->>'newsId' = $2`,
          [news.imageUrl, id]
        );
      } catch (err) {
        req.log?.warn({ err, newsId: id }, 'news image: notification sync failed');
      }
    }

    res.status(200).json(ok(news, 'تم تحديث الخبر'));
  }

  // DELETE /api/news/:id
  static async delete(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const deleted = await NewsService.deleteNews(id);
    if (!deleted) {
      throw new ApiError(404, 'الخبر غير موجود أو تم حذفه مسبقاً', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(ok(null, 'تم حذف الخبر بنجاح'));
  }

  // PATCH /api/news/:id/publish
  static async publish(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const news = await NewsService.publishNews(id);
    if (!news) {
      throw new ApiError(404, 'الخبر غير موجود', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(ok(news, 'تم نشر الخبر بنجاح'));
  }
}
