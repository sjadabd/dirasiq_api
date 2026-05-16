import type { Request, Response } from 'express';

import { StudentUnifiedSearchService } from '../../services/student/search.service';
import { ok } from '../../utils/response.util';

export class StudentSearchController {
  // GET /api/student/search/unified?q=&maxDistance=&page=&limit=
  static async unified(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const query = req.query as unknown as {
      q?: string;
      maxDistance?: number;
      page?: number;
      limit?: number;
    };

    const params: Record<string, unknown> = {};
    if (query.q && query.q.trim() !== '') params['q'] = query.q;
    if (typeof query.maxDistance === 'number') params['maxDistance'] = query.maxDistance;
    if (typeof query.page === 'number') params['page'] = query.page;
    if (typeof query.limit === 'number') params['limit'] = query.limit;

    const data = await StudentUnifiedSearchService.unifiedSearch(studentId, params);
    res.status(200).json(ok(data, 'نتائج البحث'));
  }
}
