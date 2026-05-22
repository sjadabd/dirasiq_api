// Super-admin controller for /api/super-admin/teacher-applications/* — Phase 1.
//
// Phase 1 surface:
//   - GET /          : list with status filter, free-text search, pagination.
//   - GET /:id       : single application detail.
//
// Phase 2 will add:
//   - PATCH /:id/approve
//   - PATCH /:id/reject
//   - PATCH /:id/request-more-info

import type { Request, Response } from 'express';

import { TeacherApplicationService } from '../../services/teacher-application.service';
import type {
  TeacherApplicationListQuery,
} from '../../schemas/teacher-application.schemas';
import type { TeacherApplicationStatus } from '../../types';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';
import { ok, paginated } from '../../utils/response.util';

export class SuperAdminTeacherApplicationController {
  // GET /api/super-admin/teacher-applications
  static async list(req: Request, res: Response): Promise<void> {
    const { page, limit } = parsePagination(req.query);
    const q = req.query as unknown as TeacherApplicationListQuery;

    // optionalString resolves to {} | undefined under
    // exactOptionalPropertyTypes; narrow to a real string here.
    const search = typeof q.search === 'string' ? q.search : undefined;

    const filters: { status?: TeacherApplicationStatus; search?: string } = {};
    if (q.status) filters.status = q.status;
    if (search) filters.search = search;

    const { rows, total } = await TeacherApplicationService.listForAdmin(
      page,
      limit,
      filters
    );

    res.status(200).json(
      paginated(rows, buildPaginationMeta(total, page, limit), 'قائمة طلبات الانضمام')
    );
  }

  // GET /api/super-admin/teacher-applications/:id
  static async detail(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const application = await TeacherApplicationService.getByIdForAdmin(id);
    res.status(200).json(ok(application, 'تفاصيل طلب الانضمام'));
  }
}
