// Public, unauthenticated news listing for the marketing site / Flutter
// pre-login splash. Filters to web-visible news types only.

import type { Request, Response } from 'express';

import { NewsService } from '../../services/news.service';
import { WEB_VISIBLE_NEWS_TYPES } from '../../utils/news-targeting.util';
import { ok } from '../../utils/response.util';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export class PublicNewsController {
  // GET /api/public/news
  static async list(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as { limit?: number };
    const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
    const page = 1;
    const newsTypes = [...WEB_VISIBLE_NEWS_TYPES];

    const result = await NewsService.getAllNews(page, limit, undefined, true, newsTypes);
    res.status(200).json(ok(result.data, 'الأخبار العامة'));
  }
}
