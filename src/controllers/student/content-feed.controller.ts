import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

import { AdvertisementService } from '../../services/advertisement.service';
import { ContentFeedService } from '../../services/content-feed.service';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';
import { ok, paginated } from '../../utils/response.util';

export const recordViewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  skip: () => process.env['NODE_ENV'] === 'test',
  handler: () => {
    throw new ApiError(429, 'طلبات كثيرة، حاول لاحقاً', ErrorCodes.RATE_LIMITED);
  },
});

export class StudentContentFeedController {
  static async feed(req: Request, res: Response): Promise<void> {
    const studentState = req.user!.state ?? null;
    const { page, limit, offset } = parsePagination(req.query);

    const { items, total } = await ContentFeedService.listForStudent({
      studentState,
      limit,
      offset,
    });

    res.status(200).json(paginated(items, buildPaginationMeta(total, page, limit), 'الأخبار والإعلانات'));
  }

  static async newsDetail(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const row = await ContentFeedService.getNewsDetail(id);
    if (!row) throw new ApiError(404, 'الخبر غير موجود', ErrorCodes.NOT_FOUND);
    res.status(200).json(
      ok(
        {
          id: row.id,
          itemType: 'news',
          title: row.title,
          description: row.description,
          coverImageUrl: row.cover_image_url,
          publisherName: 'MulhimIQ',
          badge: 'news',
          publishedAt: row.published_at,
        },
        'تفاصيل الخبر',
      ),
    );
  }

  static async advertisementDetail(req: Request, res: Response): Promise<void> {
    const studentId = req.user!.id as string;
    const id = req.params['id'] as string;
    const ad = await AdvertisementService.getForStudent(id, studentId);
    res.status(200).json(
      ok(
        {
          id: ad.id,
          itemType: 'advertisement',
          title: ad.title,
          description: ad.description,
          coverImageUrl: ad.coverImageUrl,
          publisherName: ad.teacherName ?? '',
          badge: 'ad',
          publishedAt: ad.startDate ?? ad.approvedAt ?? ad.createdAt,
          governorate: ad.teacherGovernorate,
        },
        'تفاصيل الإعلان',
      ),
    );
  }

  static async recordView(req: Request, res: Response): Promise<void> {
    const studentId = req.user!.id as string;
    const id = req.params['id'] as string;
    const result = await AdvertisementService.recordView(studentId, id);
    res.status(200).json(ok(result, 'تم تسجيل المشاهدة'));
  }
}
