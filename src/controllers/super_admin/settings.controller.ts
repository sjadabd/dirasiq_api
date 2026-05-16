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
}
