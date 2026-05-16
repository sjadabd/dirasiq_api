import type { Request, Response } from 'express';

import { SubscriptionPackageModel } from '../../models/subscription-package.model';
import { WaylPaymentLinkLogModel } from '../../models/wayl-payment-link-log.model';
import { WaylPaymentLinkModel } from '../../models/wayl-payment-link.model';
import { WaylService } from '../../services/wayl.service';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok } from '../../utils/response.util';

const DEFAULT_IMAGE_URL_FALLBACK = 'https://mulhimiq.com/favicon.ico';
const DEFAULT_REDIRECT_FALLBACK = 'https://mulhimiq.com/teacher/dashboard';

const mapWaylError = (err: unknown): ApiError => {
  const message = String(err instanceof Error ? err.message : err ?? '').toLowerCase();
  if (message.includes('invalid authentication key')) {
    return new ApiError(400, 'Invalid authentication key', ErrorCodes.SERVICE_UNAVAILABLE);
  }
  if (message.includes('missing fields')) {
    return new ApiError(400, err instanceof Error ? err.message : 'Missing fields', ErrorCodes.INVALID_REQUEST);
  }
  return new ApiError(500, err instanceof Error ? err.message : 'خطأ داخلي في الخادم', ErrorCodes.INTERNAL_ERROR, undefined, {
    expected: false,
    cause: err,
  });
};

const logFailure = async (referenceId: string | null, err: unknown) => {
  try {
    await WaylPaymentLinkLogModel.create({
      paymentLinkId: null,
      referenceId,
      eventType: 'create_link_error',
      httpStatus: null,
      payload: { message: err instanceof Error ? err.message : String(err) },
    });
  } catch {
    /* logging errors are best-effort */
  }
};

export class TeacherWaylPaymentController {
  // POST /teacher/payments/wayl/subscription-link
  static async createSubscriptionLink(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { packageId } = req.body as { packageId: string };

    const pkg = await SubscriptionPackageModel.findById(packageId);
    if (!pkg || !pkg.isActive) {
      throw new ApiError(404, 'الباقة غير موجودة أو غير مفعلة', ErrorCodes.NOT_FOUND);
    }
    if (pkg.isFree || Number(pkg.price) <= 0) {
      throw new ApiError(
        400,
        'هذه الباقة مجانية ولا تحتاج دفع',
        ErrorCodes.BUSINESS_RULE
      );
    }
    if (Number(pkg.price) < 1000) {
      throw new ApiError(
        400,
        'الحد الأدنى للدفع عبر Wayl هو 1000 دينار',
        ErrorCodes.BUSINESS_RULE
      );
    }

    const referenceId = `sub_${teacherId}_${packageId}_${Date.now()}`;
    const webhookUrl = process.env['WAYL_WEBHOOK_URL'];
    if (!webhookUrl) {
      throw new ApiError(500, 'WAYL_WEBHOOK_URL is not configured', ErrorCodes.SERVICE_UNAVAILABLE);
    }
    const redirectionUrl = process.env['WAYL_REDIRECT_URL'] || DEFAULT_REDIRECT_FALLBACK;
    const webhookSecret = WaylService.generateSecret();
    const defaultImageUrl = process.env['WAYL_DEFAULT_LINEITEM_IMAGE_URL'] || DEFAULT_IMAGE_URL_FALLBACK;

    const payload = {
      referenceId,
      total: Number(pkg.price),
      currency: 'IQD' as const,
      webhookUrl,
      webhookSecret,
      redirectionUrl,
      lineItem: [
        {
          label: `Subscription: ${pkg.name}`,
          amount: Number(pkg.price),
          type: 'increase',
          image: defaultImageUrl,
        },
      ],
    };

    await WaylPaymentLinkLogModel.create({
      paymentLinkId: null,
      referenceId,
      eventType: 'create_link_request',
      httpStatus: null,
      payload,
    });

    try {
      const waylRes = await WaylService.createLink(payload);
      const url = waylRes?.data?.url || waylRes?.url;
      const waylOrderId = waylRes?.data?.id || waylRes?.id || null;
      const waylCode = waylRes?.data?.code || waylRes?.code || null;

      const created = await WaylPaymentLinkModel.create({
        teacherId,
        purpose: 'subscription',
        subscriptionPackageId: packageId,
        amount: Number(pkg.price),
        currency: 'iqd',
        referenceId,
        waylSecret: webhookSecret,
        waylUrl: url || null,
        waylOrderId,
        waylCode,
      });

      await WaylPaymentLinkLogModel.create({
        paymentLinkId: created.id,
        referenceId,
        eventType: 'create_link_response',
        httpStatus: 200,
        payload: waylRes,
      });

      res.status(200).json(ok({ url, referenceId }, 'تم إنشاء رابط الدفع'));
    } catch (err) {
      await logFailure(referenceId, err);
      throw mapWaylError(err);
    }
  }

  // POST /teacher/payments/wayl/wallet-topup-link
  static async createWalletTopupLink(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { amount } = req.body as { amount: number };

    const referenceId = `topup_${teacherId}_${Date.now()}`;
    const webhookUrl = process.env['WAYL_WEBHOOK_URL'];
    if (!webhookUrl) {
      throw new ApiError(500, 'WAYL_WEBHOOK_URL is not configured', ErrorCodes.SERVICE_UNAVAILABLE);
    }
    const redirectionUrl = process.env['WAYL_REDIRECT_URL'] || DEFAULT_REDIRECT_FALLBACK;
    const webhookSecret = WaylService.generateSecret();
    const defaultImageUrl = process.env['WAYL_DEFAULT_LINEITEM_IMAGE_URL'] || DEFAULT_IMAGE_URL_FALLBACK;

    const payload = {
      referenceId,
      total: amount,
      currency: 'IQD' as const,
      webhookUrl,
      redirectionUrl,
      webhookSecret,
      lineItem: [
        {
          label: 'Wallet Top-up',
          amount,
          type: 'increase',
          image: defaultImageUrl,
        },
      ],
    };

    await WaylPaymentLinkLogModel.create({
      paymentLinkId: null,
      referenceId,
      eventType: 'create_link_request',
      httpStatus: null,
      payload,
    });

    try {
      const waylRes = await WaylService.createLink(payload);
      const url = waylRes?.data?.url || waylRes?.url;
      const waylOrderId = waylRes?.data?.id || waylRes?.id || null;
      const waylCode = waylRes?.data?.code || waylRes?.code || null;

      const created = await WaylPaymentLinkModel.create({
        teacherId,
        purpose: 'wallet_topup',
        amount,
        currency: 'iqd',
        referenceId,
        waylSecret: webhookSecret,
        waylUrl: url || null,
        waylOrderId,
        waylCode,
      });

      await WaylPaymentLinkLogModel.create({
        paymentLinkId: created.id,
        referenceId,
        eventType: 'create_link_response',
        httpStatus: 200,
        payload: waylRes,
      });

      res.status(200).json(ok({ url, referenceId }, 'تم إنشاء رابط شحن المحفظة'));
    } catch (err) {
      await logFailure(referenceId, err);
      throw mapWaylError(err);
    }
  }
}
