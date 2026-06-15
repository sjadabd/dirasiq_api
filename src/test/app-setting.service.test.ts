jest.mock('../models/app-setting.model', () => ({
  AppSettingModel: {
    get: jest.fn(),
    upsert: jest.fn(),
  },
}));

import { AppSettingModel } from '../models/app-setting.model';
import { AppSettingService } from '../services/app-setting.service';

const getMock = AppSettingModel.get as jest.Mock;
const upsertMock = AppSettingModel.upsert as jest.Mock;

describe('AppSettingService payment features', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defaults both payment features to disabled', async () => {
    getMock.mockResolvedValue(null);

    await expect(AppSettingService.getPaymentFeatures()).resolves.toEqual({
      videoCoursePurchasesEnabled: false,
      teacherWalletTopupsEnabled: false,
    });
  });

  it('reads and updates both payment feature flags', async () => {
    getMock
      .mockResolvedValueOnce({ value: 'true' })
      .mockResolvedValueOnce({ value: 'false' });

    await expect(AppSettingService.getPaymentFeatures()).resolves.toEqual({
      videoCoursePurchasesEnabled: true,
      teacherWalletTopupsEnabled: false,
    });

    upsertMock.mockResolvedValue({});
    await expect(
      AppSettingService.setPaymentFeatures(
        {
          videoCoursePurchasesEnabled: false,
          teacherWalletTopupsEnabled: true,
        },
        'admin-id'
      )
    ).resolves.toEqual({
      videoCoursePurchasesEnabled: false,
      teacherWalletTopupsEnabled: true,
    });

    expect(upsertMock).toHaveBeenCalledTimes(2);
  });
});
