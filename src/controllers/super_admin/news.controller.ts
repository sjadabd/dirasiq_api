import { NewsService } from '@/services/news.service';
import { CreateNewsRequest, UpdateNewsRequest, NewsType } from '@/types';
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

export class NewsController {
  // Save base64 image to disk under public/uploads/news and return public path '/uploads/news/<filename>'
  private static async saveBase64Image(base64Data: string): Promise<string> {
    // Validate and parse data URI
    const matches = base64Data.match(/^data:(image\/[-+\w.]+);base64,(.+)$/i);
    if (!matches) {
      throw new Error('Invalid base64 image data');
    }
    const mimeType: string = matches[1] as string;
    const base64String: string = matches[2] as string;

    const ext = (() => {
      const map: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'image/bmp': '.bmp',
        'image/svg+xml': '.svg'
      };
      return map[mimeType as keyof typeof map] || '.png';
    })();

    const fileName = `news_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const uploadDir = path.resolve(process.cwd(), 'public', 'uploads', 'news');
    const filePath = path.join(uploadDir, fileName);

    await fs.promises.mkdir(uploadDir, { recursive: true });
    const buffer = Buffer.from(base64String as string, 'base64');
    await fs.promises.writeFile(filePath, buffer);

    // Return public URL path used by the app
    return `/uploads/news/${fileName}`;
  }

  // Delete existing image file if it's a locally stored news image
  private static async deleteLocalNewsImageIfExists(publicPath: string): Promise<void> {
    try {
      if (!publicPath || typeof publicPath !== 'string') return;
      // Only allow deletion inside our news uploads folder
      if (!publicPath.startsWith('/uploads/news/')) return;
      const relative = publicPath.replace(/^\//, ''); // remove leading slash
      const fileOnDisk = path.resolve(process.cwd(), 'public', relative.replace(/^uploads\//, 'uploads/'));
      await fs.promises.unlink(fileOnDisk).catch(() => {});
    } catch {
      // Silently ignore delete errors
    }
  }
  /**
   * إنشاء خبر جديد
   */
  static async create(req: Request, res: Response) {
    try {
      const data: CreateNewsRequest = req.body;
      // Optional: validate provided newsType value if present
      if (data.newsType && !Object.values(NewsType).includes(data.newsType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid newsType value'
        });
      }
      // Handle base64 image upload if provided
      if (data.imageUrl && typeof data.imageUrl === 'string' && data.imageUrl.startsWith('data:image')) {
        try {
          const savedPath = await NewsController.saveBase64Image(data.imageUrl);
          data.imageUrl = savedPath;
        } catch (e: any) {
          return res.status(400).json({
            success: false,
            message: 'Invalid image data provided',
            errors: [e.message]
          });
        }
      }
      const news = await NewsService.createNews(data);

      return res.status(201).json({
        success: true,
        message: 'تم إنشاء الخبر بنجاح',
        data: news,
      });
    } catch (error: any) {
      console.error('❌ Error creating news:', error);
      return res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء إنشاء الخبر',
        errors: [error.message],
      });
    }
  }

  /**
   * جلب خبر واحد بالمعرف
   */
  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params as { id?: string };
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'معرف الخبر مفقود',
        });
      }
      const news = await NewsService.getNewsById(id);

      if (!news) {
        return res.status(404).json({
          success: false,
          message: 'الخبر غير موجود',
        });
      }

      return res.json({
        success: true,
        data: news,
      });
    } catch (error: any) {
      console.error('❌ Error fetching news by ID:', error);
      return res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء جلب الخبر',
        errors: [error.message],
      });
    }
  }

  /**
   * جلب جميع الأخبار مع بحث وترقيم
   */
  static async getAll(req: Request, res: Response) {
    try {
      const page = parseInt(req.query['page'] as string) || 1;
      const limit = parseInt(req.query['limit'] as string) || 10;
      const search = req.query['search'] as string | undefined;
      const isActive =
        req.query['isActive'] !== undefined
          ? (req.query['isActive'] as string) === 'true'
          : undefined;
      const newsTypeParam = req.query['newsType'] as string | undefined;
      let newsTypes: NewsType[] | undefined = undefined;
      if (newsTypeParam && (Object.values(NewsType) as string[]).includes(newsTypeParam)) {
        const nt = newsTypeParam as NewsType;
        if (nt === NewsType.WEB) {
          newsTypes = [NewsType.WEB, NewsType.WEB_AND_MOBILE];
        } else if (nt === NewsType.MOBILE) {
          newsTypes = [NewsType.MOBILE, NewsType.WEB_AND_MOBILE];
        } else if (nt === NewsType.WEB_AND_MOBILE) {
          newsTypes = [NewsType.WEB_AND_MOBILE];
        }
      }

      const result = await NewsService.getAllNews(page, limit, search, isActive, newsTypes);

      return res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error('❌ Error fetching all news:', error);
      return res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء جلب الأخبار',
        errors: [error.message],
      });
    }
  }

  /**
   * تحديث خبر
   */
  static async update(req: Request, res: Response) {
    try {
      const { id } = req.params as { id?: string };
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'معرف الخبر مفقود',
        });
      }
      const data: UpdateNewsRequest = req.body;
      // Handle base64 image upload if provided during update
      if (data.imageUrl && typeof data.imageUrl === 'string' && data.imageUrl.startsWith('data:image')) {
        try {
          // Load current news to remove old image if exists
          const current = await NewsService.getNewsById(id);
          if (!current) {
            return res.status(404).json({
              success: false,
              message: 'الخبر غير موجود',
            });
          }
          if (current.imageUrl) {
            await NewsController.deleteLocalNewsImageIfExists(current.imageUrl);
          }
          const savedPath = await NewsController.saveBase64Image(data.imageUrl);
          data.imageUrl = savedPath;
        } catch (e: any) {
          return res.status(400).json({
            success: false,
            message: 'Invalid image data provided',
            errors: [e.message]
          });
        }
      }
      const news = await NewsService.updateNews(id, data);

      if (!news) {
        return res.status(404).json({
          success: false,
          message: 'الخبر غير موجود',
        });
      }

      return res.json({
        success: true,
        message: 'تم تحديث الخبر بنجاح',
        data: news,
      });
    } catch (error: any) {
      console.error('❌ Error updating news:', error);
      return res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء تحديث الخبر',
        errors: [error.message],
      });
    }
  }

  /**
   * حذف خبر (Soft Delete)
   */
  static async delete(req: Request, res: Response) {
    try {
      const { id } = req.params as { id?: string };
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'معرف الخبر مفقود',
        });
      }
      const deleted = await NewsService.deleteNews(id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'الخبر غير موجود أو تم حذفه مسبقاً',
        });
      }

      return res.json({
        success: true,
        message: 'تم حذف الخبر بنجاح',
      });
    } catch (error: any) {
      console.error('❌ Error deleting news:', error);
      return res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء حذف الخبر',
        errors: [error.message],
      });
    }
  }

  /**
   * نشر خبر
   */
  static async publish(req: Request, res: Response) {
    try {
      const { id } = req.params as { id?: string };
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'معرف الخبر مفقود',
        });
      }
      const news = await NewsService.publishNews(id);

      if (!news) {
        return res.status(404).json({
          success: false,
          message: 'الخبر غير موجود',
        });
      }

      return res.json({
        success: true,
        message: 'تم نشر الخبر بنجاح',
        data: news,
      });
    } catch (error: any) {
      console.error('❌ Error publishing news:', error);
      return res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء نشر الخبر',
        errors: [error.message],
      });
    }
  }
}

