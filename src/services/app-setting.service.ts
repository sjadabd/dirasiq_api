import { AppSettingModel } from '../models/app-setting.model';

export class AppSettingService {
  static BOOKING_CONFIRM_FEE_KEY = 'booking_confirm_fee_iqd';
  static VIDEO_COURSE_PURCHASES_ENABLED_KEY =
    'video_course_purchases_enabled';
  static TEACHER_WALLET_TOPUPS_ENABLED_KEY =
    'teacher_wallet_topups_enabled';

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

  private static async getBoolean(
    key: string,
    defaultValue = false
  ): Promise<boolean> {
    const row = await AppSettingModel.get(key);
    if (!row) return defaultValue;
    return row.value.toLowerCase() === 'true';
  }

  private static async setBoolean(
    key: string,
    value: boolean,
    updatedBy?: string | null
  ): Promise<boolean> {
    await AppSettingModel.upsert({
      key,
      value: String(value),
      valueType: 'boolean',
      updatedBy: updatedBy || null,
    });
    return value;
  }

  static async getPaymentFeatures(): Promise<{
    videoCoursePurchasesEnabled: boolean;
    teacherWalletTopupsEnabled: boolean;
  }> {
    const [videoCoursePurchasesEnabled, teacherWalletTopupsEnabled] =
      await Promise.all([
        this.getBoolean(this.VIDEO_COURSE_PURCHASES_ENABLED_KEY),
        this.getBoolean(this.TEACHER_WALLET_TOPUPS_ENABLED_KEY),
      ]);

    return {
      videoCoursePurchasesEnabled,
      teacherWalletTopupsEnabled,
    };
  }

  static async setPaymentFeatures(
    features: {
      videoCoursePurchasesEnabled: boolean;
      teacherWalletTopupsEnabled: boolean;
    },
    updatedBy?: string | null
  ): Promise<{
    videoCoursePurchasesEnabled: boolean;
    teacherWalletTopupsEnabled: boolean;
  }> {
    const [videoCoursePurchasesEnabled, teacherWalletTopupsEnabled] =
      await Promise.all([
        this.setBoolean(
          this.VIDEO_COURSE_PURCHASES_ENABLED_KEY,
          features.videoCoursePurchasesEnabled,
          updatedBy
        ),
        this.setBoolean(
          this.TEACHER_WALLET_TOPUPS_ENABLED_KEY,
          features.teacherWalletTopupsEnabled,
          updatedBy
        ),
      ]);

    return {
      videoCoursePurchasesEnabled,
      teacherWalletTopupsEnabled,
    };
  }
}
