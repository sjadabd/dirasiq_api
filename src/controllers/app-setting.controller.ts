import type { Request, Response } from 'express';

import { AppSettingService } from '../services/app-setting.service';
import { ok } from '../utils/response.util';

export class AppSettingController {
  static async getPaymentFeatures(
    _req: Request,
    res: Response
  ): Promise<void> {
    const features = await AppSettingService.getPaymentFeatures();
    res.status(200).json(ok(features, 'تم جلب إعدادات ميزات الدفع'));
  }
}
