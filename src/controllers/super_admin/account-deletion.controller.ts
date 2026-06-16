import type { Request, Response } from 'express';

import {
  AccountDeletionRequestModel,
  type AccountDeletionRequestStatus,
} from '../../models/account-deletion-request.model';
import { paginated } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';

export class SuperAdminAccountDeletionController {
  // GET /api/super-admin/account-deletion-requests
  static async list(req: Request, res: Response): Promise<void> {
    const { page, limit, offset } = parsePagination(req.query);
    const status = (req.query as { status?: AccountDeletionRequestStatus }).status;

    const listArgs: {
      limit: number;
      offset: number;
      status?: AccountDeletionRequestStatus;
    } = { limit, offset };
    if (status) listArgs.status = status;

    const [items, total] = await Promise.all([
      AccountDeletionRequestModel.listForAdmin(listArgs),
      AccountDeletionRequestModel.countForAdmin(status),
    ]);

    res
      .status(200)
      .json(paginated(items, buildPaginationMeta(total, page, limit), 'تم جلب طلبات حذف الحساب'));
  }
}
