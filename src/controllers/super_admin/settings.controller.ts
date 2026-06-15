import type { Request, Response } from 'express';

import { AppSettingService } from '../../services/app-setting.service';
import { ok } from '../../utils/response.util';

export class SuperAdminSettingsController {
  // GET /api/super-admin/settings/booking-confirm-fee
  static async getBookingConfirmFee(_req: Request, res: Response): Promise<void> {
    const fee = await AppSettingService.getBookingConfirmFeeIqd();
    res.status(200).json(ok({ feeIqd: fee }, 'تم جلب رسوم تأكيد الطلب'));
  }

  // PUT /api/super-admin/settings/booking-confirm-fee
  static async setBookingConfirmFee(req: Request, res: Response): Promise<void> {
    const { feeIqd } = req.body as { feeIqd: number };
    const updatedBy = req.user.id as string;
    const fee = await AppSettingService.setBookingConfirmFeeIqd(feeIqd, updatedBy);
    res.status(200).json(ok({ feeIqd: fee }, 'تم تحديث رسوم تأكيد الطلب'));
  }

  static async getPaymentFeatures(_req: Request, res: Response): Promise<void> {
    const features = await AppSettingService.getPaymentFeatures();
    res.status(200).json(ok(features, 'تم جلب إعدادات ميزات الدفع'));
  }

  static async setPaymentFeatures(req: Request, res: Response): Promise<void> {
    const updatedBy = req.user.id as string;
    const features = await AppSettingService.setPaymentFeatures(
      req.body as {
        videoCoursePurchasesEnabled: boolean;
        teacherWalletTopupsEnabled: boolean;
      },
      updatedBy
    );
    res.status(200).json(ok(features, 'تم تحديث إعدادات ميزات الدفع'));
  }
}
