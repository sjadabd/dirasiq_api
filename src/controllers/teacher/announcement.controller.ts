import type { Request, Response } from 'express';

import { NewsService } from '../../services/news.service';
import { NewsType } from '../../types';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';
import { ok, paginated } from '../../utils/response.util';

const TEACHER_APP_NEWS_TYPES = [NewsType.TEACHER_MOBILE];

export class TeacherAnnouncementController {
  static async list(req: Request, res: Response): Promise<void> {
    const { page, limit } = parsePagination(req.query);
    const result = await NewsService.getAllNews(page, limit, undefined, true, TEACHER_APP_NEWS_TYPES);
    res.status(200).json(
      paginated(result.data, buildPaginationMeta(result.pagination.total, page, limit), 'إعلانات المنصة'),
    );
  }

  static async getById(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const item = await NewsService.getNewsById(id);
    if (!item || !item.isActive || item.deletedAt) {
      throw new ApiError(404, 'الإعلان غير موجود', ErrorCodes.NOT_FOUND);
    }
    if (!TEACHER_APP_NEWS_TYPES.includes(item.newsType)) {
      throw new ApiError(404, 'الإعلان غير متاح', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(ok(item, 'تفاصيل الإعلان'));
  }
}
