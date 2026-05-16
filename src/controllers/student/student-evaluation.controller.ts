import type { Request, Response } from 'express';

import { StudentEvaluationService } from '../../services/student-evaluation.service';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';

const getService = (): StudentEvaluationService => new StudentEvaluationService();

export class StudentStudentEvaluationController {
  // GET /api/student/evaluations
  static async list(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const query = req.query as unknown as {
      page?: number;
      limit?: number;
      from?: string;
      to?: string;
    };
    const { page, limit } = parsePagination(query);
    const filters: Record<string, unknown> = { page, limit };
    if (query.from) filters['from'] = query.from;
    if (query.to) filters['to'] = query.to;

    const svc = getService();
    const result = await svc.listForStudent(studentId, filters);
    res
      .status(200)
      .json(paginated(result.data, buildPaginationMeta(result.total, page, limit), 'تم جلب تقييماتك'));
  }

  // GET /api/student/evaluations/:id
  static async getById(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const id = req.params['id'] as string;
    const svc = getService();
    const item = await svc.getById(id);
    if (!item) {
      throw new ApiError(404, 'التقييم غير موجود', ErrorCodes.NOT_FOUND);
    }
    if (String(item.student_id) !== studentId) {
      throw new ApiError(403, 'الوصول مرفوض', ErrorCodes.FORBIDDEN);
    }
    res.status(200).json(ok(item, 'تم جلب التقييم'));
  }
}
