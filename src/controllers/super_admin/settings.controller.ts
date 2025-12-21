import { Request, Response } from 'express';
import { AppSettingService } from '../../services/app-setting.service';

export class SuperAdminSettingsController {
  static async getBookingConfirmFee(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const fee = await AppSettingService.getBookingConfirmFeeIqd();
      res
        .status(200)
        .json({
          success: true,
          message: 'تم جلب رسوم تأكيد الطلب',
          data: { feeIqd: fee },
        });
    } catch (e: any) {
      res
        .status(500)
        .json({
          success: false,
          message: 'خطأ داخلي في الخادم',
          errors: [e.message || 'error'],
        });
    }
  }

  static async setBookingConfirmFee(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const amount = Number(req.body?.feeIqd);
      if (!Number.isFinite(amount) || amount < 0) {
        res
          .status(400)
          .json({
            success: false,
            message: 'قيمة غير صحيحة',
            errors: ['feeIqd must be a non-negative number'],
          });
        return;
      }
      const updatedBy = (req as any).user?.id || null;
      const fee = await AppSettingService.setBookingConfirmFeeIqd(
        amount,
        updatedBy
      );
      res
        .status(200)
        .json({
          success: true,
          message: 'تم تحديث رسوم تأكيد الطلب',
          data: { feeIqd: fee },
        });
    } catch (e: any) {
      res
        .status(500)
        .json({ success: false, message: e.message || 'خطأ داخلي في الخادم' });
    }
  }
}
