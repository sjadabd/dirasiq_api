import { NewsModel } from '@/models/news.model';
import {
  CreateNewsRequest,
  News,
  NewsType,
  PaginatedResponse,
  UpdateNewsRequest
} from '@/types';

export class NewsService {
  /**
   * إنشاء خبر جديد
   */
  static async createNews(data: CreateNewsRequest): Promise<News> {
    return await NewsModel.create(data);
  }

  /**
   * جلب خبر بالمعرف
   */
  static async getNewsById(id: string): Promise<News | null> {
    const exists = await NewsModel.exists(id);
    if (!exists) return null;
    return await NewsModel.findById(id);
  }

  /**
   * جلب كل الأخبار مع بحث وترقيم الصفحات
   */
  static async getAllNews(
    page: number = 1,
    limit: number = 10,
    search?: string,
    isActive?: boolean,
    newsTypes?: NewsType[]
  ): Promise<PaginatedResponse<News>> {
    const { news, total } = await NewsModel.findAll(page, limit, search, isActive, newsTypes);

    return {
      data: news,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * تحديث خبر
   */
  static async updateNews(id: string, data: UpdateNewsRequest): Promise<News | null> {
    const exists = await NewsModel.exists(id);
    if (!exists) return null;
    return await NewsModel.update(id, data);
  }

  /**
   * حذف خبر (Soft Delete)
   */
  static async deleteNews(id: string): Promise<boolean> {
    const exists = await NewsModel.exists(id);
    if (!exists) return false;
    return await NewsModel.delete(id);
  }

  /**
   * نشر خبر
   */
  static async publishNews(id: string): Promise<News | null> {
    const exists = await NewsModel.exists(id);
    if (!exists) return null;
    return await NewsModel.publish(id);
  }
}
