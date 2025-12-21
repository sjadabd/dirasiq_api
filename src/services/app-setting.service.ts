import { AppSettingModel } from '../models/app-setting.model';

export class AppSettingService {
  static BOOKING_CONFIRM_FEE_KEY = 'booking_confirm_fee_iqd';

  static async getBookingConfirmFeeIqd(): Promise<number> {
    const row = await AppSettingModel.get(this.BOOKING_CONFIRM_FEE_KEY);
    if (!row) return 0;
    const v = Number(row.value);
    return Number.isFinite(v) ? v : 0;
  }

  static async setBookingConfirmFeeIqd(
    amount: number,
    updatedBy?: string | null
  ): Promise<number> {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('قيمة غير صحيحة');
    }
    await AppSettingModel.upsert({
      key: this.BOOKING_CONFIRM_FEE_KEY,
      value: String(amount),
      valueType: 'number',
      updatedBy: updatedBy || null,
    });
    return amount;
  }
}
