import { Router } from 'express';
import { NewsService } from '../../services/news.service';
import { NewsType } from '../../types';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const limit = Math.max(
      1,
      Math.min(
        parseInt(String(req.query['limit'] || '99999999999'), 10) || 10,
        50
      )
    );
    const page = 1;
    const newsTypes: NewsType[] = [NewsType.WEB, NewsType.WEB_AND_MOBILE];

    const result = await NewsService.getAllNews(
      page,
      limit,
      undefined,
      true,
      newsTypes
    );

    return res.json({
      success: true,
      data: result.data,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب الأخبار العامة',
      errors: [error.message],
    });
  }
});

export default router;
