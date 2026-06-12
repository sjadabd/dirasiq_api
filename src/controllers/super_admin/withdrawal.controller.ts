import type { Request, Response } from 'express';

import {
  TeacherWithdrawalRequestModel,
  type WithdrawalStatus,
  type PayoutMethod,
} from '../../models/teacher-withdrawal-request.model';
import { WithdrawalService } from '../../services/withdrawal.service';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ImageService } from '../../utils/image.service';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';

export class SuperAdminWithdrawalController {
  static async list(req: Request, res: Response): Promise<void> {
    const { page, limit, offset } = parsePagination(req.query);
    const status = (req.query as { status?: WithdrawalStatus }).status;
    const [items, total] = await Promise.all([
      TeacherWithdrawalRequestModel.listForAdmin(
        status ? { status, limit, offset } : { limit, offset }
      ),
      TeacherWithdrawalRequestModel.countForAdmin(status),
    ]);
    res
      .status(200)
      .json(paginated(items, buildPaginationMeta(total, page, limit), 'تم جلب طلبات السحب'));
  }

  static async approve(req: Request, res: Response): Promise<void> {
    const adminId = req.user.id as string;
    const { id } = req.params as { id: string };
    const body = req.body as { adminNotes?: string };
    const request = await WithdrawalService.approve({
      requestId: id,
      adminId,
      adminNotes: body.adminNotes ?? null,
    });
    res.status(200).json(ok(request, 'تمت الموافقة على الطلب'));
  }

  static async reject(req: Request, res: Response): Promise<void> {
    const adminId = req.user.id as string;
    const { id } = req.params as { id: string };
    const body = req.body as { reason: string };
    const request = await WithdrawalService.reject({
      requestId: id,
      adminId,
      reason: body.reason,
    });
    res.status(200).json(ok(request, 'تم رفض الطلب وإرجاع المبلغ لمحفظة الأستاذ'));
  }

  static async markPaid(req: Request, res: Response): Promise<void> {
    const adminId = req.user.id as string;
    const { id } = req.params as { id: string };
    const body = req.body as {
      method: PayoutMethod;
      reference?: string;
      destination?: string;
      receiptImage: string;
    };
    const request = await WithdrawalService.markPaid({
      requestId: id,
      adminId,
      method: body.method,
      reference: body.reference ?? null,
      destination: body.destination ?? null,
      receiptImageBase64: body.receiptImage,
    });
    res.status(200).json(ok(request, 'تم تأكيد تحويل المبلغ للأستاذ'));
  }

  /** Stream a withdrawal's transfer-receipt image from private storage. */
  static async getReceipt(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const row = await TeacherWithdrawalRequestModel.findById(id);
    if (!row || !row.payout_receipt_url) {
      throw new ApiError(404, 'لا يوجد وصل لهذا الطلب', ErrorCodes.NOT_FOUND);
    }
    const abs = ImageService.resolvePrivatePath(row.payout_receipt_url);
    if (!abs) {
      throw new ApiError(404, 'تعذّر العثور على صورة الوصل', ErrorCodes.NOT_FOUND);
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(abs);
  }
}
