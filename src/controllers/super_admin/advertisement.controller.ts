import type { Request, Response } from 'express';

import pool from '../../config/database';
import { AdvertisementModel } from '../../models/advertisement.model';
import { AdvertisementService } from '../../services/advertisement.service';
import { AdvertisementStatus } from '../../types';
import type {
  advertisementAdminListQuerySchema,
  advertisementApproveSchema,
  advertisementRejectSchema,
  advertisementSettingsUpdateSchema,
} from '../../schemas/advertisement.schemas';
import type { z } from 'zod';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';
import { ok, paginated } from '../../utils/response.util';

export class SuperAdminAdvertisementController {
  static async list(req: Request, res: Response): Promise<void> {
    const { page, limit, offset } = parsePagination(req.query);
    const q = req.query as z.infer<typeof advertisementAdminListQuerySchema>;
    const status = q.status as AdvertisementStatus | undefined;

    const listArgs: {
      limit: number;
      offset: number;
      status?: AdvertisementStatus;
      teacherId?: string;
    } = { limit, offset };
    if (status) listArgs.status = status;
    if (q.teacherId) listArgs.teacherId = q.teacherId;

    const [items, total] = await Promise.all([
      AdvertisementModel.listForAdmin(listArgs),
      AdvertisementModel.countForAdmin(status, q.teacherId),
    ]);

    res.status(200).json(paginated(items, buildPaginationMeta(total, page, limit), 'طلبات الإعلانات'));
  }

  static async getById(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const ad = await AdvertisementModel.findById(id);
    if (!ad) throw new ApiError(404, 'الإعلان غير موجود', ErrorCodes.NOT_FOUND);

    const wallet = await pool.query(
      `SELECT balance, pending_balance FROM teacher_wallets WHERE teacher_id = $1`,
      [ad.teacherId],
    );

    res.status(200).json(
      ok(
        {
          advertisement: ad,
          teacherWallet: {
            balance: Number(wallet.rows[0]?.balance ?? 0),
            pendingBalance: Number(wallet.rows[0]?.pending_balance ?? 0),
          },
        },
        'تفاصيل الإعلان',
      ),
    );
  }

  static async approve(req: Request, res: Response): Promise<void> {
    const adminId = req.user!.id as string;
    const id = req.params['id'] as string;
    const body = req.body as z.infer<typeof advertisementApproveSchema>;
    const approveInput: {
      adminNotes?: string | null;
      startDate?: Date;
      endDate?: Date;
    } = {};
    if (body.adminNotes !== undefined && body.adminNotes !== null) {
      approveInput.adminNotes = body.adminNotes;
    } else if (body.adminNotes === null) {
      approveInput.adminNotes = null;
    }
    if (body.startDate !== undefined) approveInput.startDate = body.startDate;
    if (body.endDate !== undefined) approveInput.endDate = body.endDate;
    const ad = await AdvertisementService.approve(adminId, id, approveInput);
    res.status(200).json(ok(ad, 'تمت الموافقة على الإعلان'));
  }

  static async reject(req: Request, res: Response): Promise<void> {
    const adminId = req.user!.id as string;
    const id = req.params['id'] as string;
    const body = req.body as z.infer<typeof advertisementRejectSchema>;
    const ad = await AdvertisementService.reject(adminId, id, body.reason);
    res.status(200).json(ok(ad, 'تم رفض الإعلان'));
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    await AdvertisementService.adminDelete(id);
    res.status(200).json(ok(null, 'تم حذف الإعلان'));
  }

  static async getSettings(_req: Request, res: Response): Promise<void> {
    const settings = await AdvertisementService.getSettings();
    res.status(200).json(ok(settings, 'إعدادات الإعلانات'));
  }

  static async updateSettings(req: Request, res: Response): Promise<void> {
    const adminId = req.user!.id as string;
    const body = req.body as z.infer<typeof advertisementSettingsUpdateSchema>;
    const patch: Parameters<typeof AdvertisementService.updateSettings>[0] = {
      updatedBy: adminId,
    };
    const keys = [
      'costPerClick',
      'minBudget',
      'maxBudget',
      'maxDurationDays',
      'autoEndDurationDays',
      'allowPublic',
      'allowGovernorate',
      'requireApproval',
      'maxActivePerTeacher',
      'imageSizeLimitBytes',
      'maxTitleLength',
      'maxDescriptionLength',
      'refundUnusedBudget',
      'freeClicksEnabled',
    ] as const;
    for (const key of keys) {
      if (body[key] !== undefined) {
        (patch as Record<string, unknown>)[key] = body[key];
      }
    }
    const settings = await AdvertisementService.updateSettings(patch);
    res.status(200).json(ok(settings, 'تم تحديث الإعدادات'));
  }

  static async revenueStatistics(_req: Request, res: Response): Promise<void> {
    const stats = await AdvertisementService.adminRevenueStatistics();
    res.status(200).json(ok(stats, 'إحصائيات إيرادات الإعلانات'));
  }
}
