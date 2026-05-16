import type { Request, Response } from 'express';

import { SubscriptionPackageService } from '../../services/super_admin/subscription-package.service';
import { TeacherSubscriptionService } from '../../services/teacher-subscription.service';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta } from '../../utils/pagination';

export class SubscriptionPackageController {
  static async createPackage(req: Request, res: Response): Promise<void> {
    const { name, description, maxStudents, price, durationDays, isFree } = req.body as {
      name: string;
      description?: string;
      maxStudents: number;
      price: number;
      durationDays: number;
      isFree?: boolean;
    };
    const createPayload: Record<string, unknown> = {
      name,
      maxStudents,
      price,
      durationDays,
      isFree: isFree ?? false,
    };
    if (description !== undefined) createPayload['description'] = description;
    const data = await SubscriptionPackageService.createPackage(createPayload as any);
    res.status(201).json(ok(data, 'تم إنشاء الباقة'));
  }

  static async getPackageById(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const data = await SubscriptionPackageService.getPackageById(id);
    res.status(200).json(ok(data, 'تفاصيل الباقة'));
  }

  static async getAllPackages(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as {
      page?: number;
      limit?: number;
      search?: string;
      isActive?: boolean;
      isFree?: boolean;
      deleted?: boolean;
      sortBy?: string;
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const params: Record<string, unknown> = {
      page,
      limit,
      deleted: query.deleted ?? false,
    };
    if (query.search) params['search'] = query.search;
    if (query.isActive !== undefined) params['isActive'] = query.isActive;
    if (query.isFree !== undefined) params['isFree'] = query.isFree;
    if (query.sortBy) {
      try {
        params['sortBy'] = JSON.parse(query.sortBy);
      } catch {
        /* ignore invalid JSON */
      }
    }

    const { items, total } = await SubscriptionPackageService.getAllPackages(params);
    res
      .status(200)
      .json(paginated(items, buildPaginationMeta(total, page, limit), 'قائمة الباقات'));
  }

  static async updatePackage(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const data = await SubscriptionPackageService.updatePackage(id, req.body);
    res.status(200).json(ok(data, 'تم تحديث الباقة'));
  }

  static async activatePackage(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    await SubscriptionPackageService.activatePackage(id);
    res.status(200).json(ok(null, 'تم تفعيل الباقة'));
  }

  static async deactivatePackage(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    await SubscriptionPackageService.deactivatePackage(id);
    res.status(200).json(ok(null, 'تم إلغاء تفعيل الباقة'));
  }

  static async deletePackage(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    await SubscriptionPackageService.deletePackage(id);
    res.status(200).json(ok(null, 'تم حذف الباقة'));
  }

  // GET /api/subscription-packages/active
  static async getActivePackages(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.removeHeader('ETag');

    const teacherId = req.user?.userType === 'teacher' ? (req.user.id as string) : undefined;
    const data = await SubscriptionPackageService.getActivePackages(teacherId);
    const message = teacherId
      ? 'تم جلب الباقات مع تحديد اشتراكك الحالي'
      : 'تم جلب الباقات العامة (لم يتم تحديد اشتراك)';
    res.status(200).json(ok(data, message));
  }

  // GET /api/subscription-packages/free
  static async getFreePackage(_req: Request, res: Response): Promise<void> {
    const data = await SubscriptionPackageService.getFreePackage();
    res.status(200).json(ok(data, 'الباقة المجانية'));
  }

  // POST /api/teacher/subscription-packages/:id/activate (teacher-only)
  static async activateForTeacher(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const id = req.params['id'] as string;
    const data = await TeacherSubscriptionService.activateForTeacher(teacherId, id);
    res.status(200).json(ok(data, 'تم تفعيل الاشتراك'));
  }
}
