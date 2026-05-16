import type { Request, Response } from 'express';

import { TeacherWalletTransactionModel } from '../../models/teacher-wallet-transaction.model';
import { TeacherWalletService } from '../../services/teacher-wallet.service';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';

export class TeacherWalletController {
  static async getWallet(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const balance = await TeacherWalletService.getBalance(teacherId);
    res.status(200).json(ok({ balance }, 'تم جلب المحفظة'));
  }

  static async listTransactions(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { page, limit, offset } = parsePagination(req.query);
    const items = await TeacherWalletTransactionModel.listByTeacher(teacherId, limit, offset);
    // The legacy model returns rows without a total count. Until the model is
    // updated, fall back to the page length as a soft total so the client UI
    // can still render pagination.
    const total = items.length;
    res.status(200).json(paginated(items, buildPaginationMeta(total, page, limit), 'تم جلب حركات المحفظة'));
  }
}
