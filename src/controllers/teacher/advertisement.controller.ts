import type { Request, Response } from 'express';

import { AdvertisementModel } from '../../models/advertisement.model';
import { AdvertisementService } from '../../services/advertisement.service';
import { AdvertisementVisibility, type AdvertisementStatus } from '../../types';
import type {
  advertisementCreateSchema,
  advertisementListQuerySchema,
  advertisementUpdateSchema,
} from '../../schemas/advertisement.schemas';
import type { z } from 'zod';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { maybeSaveAdvertisementImage } from '../../utils/advertisement-image.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';
import { ok, paginated } from '../../utils/response.util';

type CreateBody = z.infer<typeof advertisementCreateSchema>;
type UpdateBody = z.infer<typeof advertisementUpdateSchema>;

export class TeacherAdvertisementController {
  static async settings(_req: Request, res: Response): Promise<void> {
    const settings = await AdvertisementService.getSettings();
    res.status(200).json(ok(settings, 'إعدادات الإعلانات'));
  }

  static async list(req: Request, res: Response): Promise<void> {
    const teacherId = req.user!.id as string;
    const { page, limit, offset } = parsePagination(req.query);
    const status = (req.query as z.infer<typeof advertisementListQuerySchema>).status as
      | AdvertisementStatus
      | undefined;

    const listArgs: {
      teacherId: string;
      limit: number;
      offset: number;
      status?: AdvertisementStatus;
    } = { teacherId, limit, offset };
    if (status) listArgs.status = status;

    const [items, total] = await Promise.all([
      AdvertisementModel.listForTeacher(listArgs),
      AdvertisementModel.countForTeacher(teacherId, status),
    ]);

    res.status(200).json(paginated(items, buildPaginationMeta(total, page, limit), 'قائمة الإعلانات'));
  }

  static async statistics(req: Request, res: Response): Promise<void> {
    const teacherId = req.user!.id as string;
    const stats = await AdvertisementService.teacherStatistics(teacherId);
    res.status(200).json(ok(stats, 'إحصائيات الإعلانات'));
  }

  static async getById(req: Request, res: Response): Promise<void> {
    const teacherId = req.user!.id as string;
    const id = req.params['id'] as string;
    const ad = await AdvertisementModel.findByIdForTeacher(id, teacherId);
    if (!ad) throw new ApiError(404, 'الإعلان غير موجود', ErrorCodes.NOT_FOUND);
    res.status(200).json(ok(ad, 'تفاصيل الإعلان'));
  }

  static async create(req: Request, res: Response): Promise<void> {
    const teacherId = req.user!.id as string;
    const body = req.body as CreateBody;
    const settings = await AdvertisementService.getSettings();
    const coverImageUrl = await maybeSaveAdvertisementImage(
      body.coverImageUrl,
      settings.imageSizeLimitBytes,
    );

    const ad = await AdvertisementService.createDraft(teacherId, {
      title: body.title,
      description: body.description,
      coverImageUrl: coverImageUrl ?? null,
      visibility: body.visibility as AdvertisementVisibility,
      budgetTotal: body.budgetTotal ?? 0,
    });
    res.status(201).json(ok(ad, 'تم إنشاء الإعلان'));
  }

  static async update(req: Request, res: Response): Promise<void> {
    const teacherId = req.user!.id as string;
    const id = req.params['id'] as string;
    const body = req.body as UpdateBody;
    const settings = await AdvertisementService.getSettings();
    const patch: Partial<{
      title: string;
      description: string;
      coverImageUrl: string | null;
      visibility: AdvertisementVisibility;
      budgetTotal: number;
    }> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description;
    if (body.visibility !== undefined) patch.visibility = body.visibility as AdvertisementVisibility;
    if (body.budgetTotal !== undefined) patch.budgetTotal = body.budgetTotal;
    if (body.coverImageUrl !== undefined) {
      patch.coverImageUrl = (await maybeSaveAdvertisementImage(
        body.coverImageUrl,
        settings.imageSizeLimitBytes,
      )) ?? null;
    }
    const ad = await AdvertisementService.updateDraft(teacherId, id, patch);
    res.status(200).json(ok(ad, 'تم تحديث الإعلان'));
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const teacherId = req.user!.id as string;
    const id = req.params['id'] as string;
    await AdvertisementService.deleteDraft(teacherId, id);
    res.status(200).json(ok(null, 'تم حذف الإعلان'));
  }

  static async submit(req: Request, res: Response): Promise<void> {
    const teacherId = req.user!.id as string;
    const id = req.params['id'] as string;
    const ad = await AdvertisementService.submit(teacherId, id);
    res.status(200).json(ok(ad, 'تم تقديم الإعلان للمراجعة'));
  }

  static async cancel(req: Request, res: Response): Promise<void> {
    const teacherId = req.user!.id as string;
    const id = req.params['id'] as string;
    const ad = await AdvertisementService.cancelByTeacher(teacherId, id);
    res.status(200).json(ok(ad, 'تم إيقاف الإعلان'));
  }
}
