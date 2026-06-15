// Teacher wallet top-up via Wayl payment gateway.
//
// POST /api/teacher/wallet/topup
//   - Creates a Wayl payment link for the requested amount, stamped with a
//     per-link HMAC secret. The link's `purpose='wallet_topup'` is the flag
//     the webhook handler ([../payments/wayl-webhook.controller.ts]) keys
//     off to credit the teacher_id wallet on `paid`.
//   - The teacher_id is taken from req.user.id — never from the body. The
//     reference_id stamp embeds the same id so a leaked link still credits
//     the right wallet (and only that wallet).
//   - This controller does NOT mutate the wallet itself. The credit happens
//     server-side when Wayl posts the webhook (HMAC-verified, idempotent
//     via `link.status='paid'` short-circuit). A teacher with a leaked
//     pay-link cannot self-credit — only Wayl's signed callback can.
//
// Resurrected from Phase 7's wayl-payment.controller.ts (deleted in commit
// 0af678f alongside the subscription system). The wallet-topup half is the
// only piece we still need; the subscription half was retired with Phase 7.

import type { Request, Response } from 'express';

import { WaylPaymentLinkLogModel } from '../../models/wayl-payment-link-log.model';
import { WaylPaymentLinkModel } from '../../models/wayl-payment-link.model';
import { AppSettingService } from '../../services/app-setting.service';
import { WaylService } from '../../services/wayl.service';
import type { WalletTopupInput } from '../../schemas/teacher.schemas';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { logger } from '../../utils/logger';
import { ok } from '../../utils/response.util';

const DEFAULT_IMAGE_URL_FALLBACK = 'https://mulhimiq.com/favicon.ico';
const DEFAULT_REDIRECT_FALLBACK = 'https://mulhimiq.com/teacher/wallet?poll=1';

// Translate Wayl SDK errors into stable ApiErrors. Anything we don't
// recognise becomes a 500 — the caller (controller) re-throws via this
// helper so the global error middleware logs the cause.
const mapWaylError = (err: unknown): ApiError => {
  const message = String(err instanceof Error ? err.message : err ?? '').toLowerCase();
  if (message.includes('invalid authentication key')) {
    return new ApiError(
      503,
      'خطأ في تهيئة بوّابة الدفع — تواصل مع الدعم',
      ErrorCodes.SERVICE_UNAVAILABLE
    );
  }
  if (message.includes('missing fields')) {
    return new ApiError(
      400,
      err instanceof Error ? err.message : 'Missing fields',
      ErrorCodes.INVALID_REQUEST
    );
  }
  return new ApiError(
    500,
    'تعذّر إنشاء رابط الدفع — حاول مجدداً لاحقاً',
    ErrorCodes.INTERNAL_ERROR,
    undefined,
    { expected: false, cause: err }
  );
};

const logFailure = async (referenceId: string | null, err: unknown): Promise<void> => {
  try {
    await WaylPaymentLinkLogModel.create({
      paymentLinkId: null,
      referenceId,
      eventType: 'create_link_error',
      httpStatus: null,
      payload: { message: err instanceof Error ? err.message : String(err) },
    });
  } catch {
    // Best-effort: log persistence failure must never mask the original error.
  }
};

export class TeacherWalletTopupController {
  // POST /api/teacher/wallet/topup
  static async createTopupLink(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { amount } = req.body as WalletTopupInput;

    const features = await AppSettingService.getPaymentFeatures();
    if (!features.teacherWalletTopupsEnabled) {
      throw new ApiError(
        503,
        'سوف تتوفر هذه الميزة قريبًا',
        ErrorCodes.SERVICE_UNAVAILABLE,
        { feature: 'teacher_wallet_topups' }
      );
    }

    // Env preflight — fail with a clear ops-side message instead of a
    // generic 500 from the Wayl SDK if the merchant token isn't set.
    const webhookUrl = process.env['WAYL_WEBHOOK_URL'];
    if (!webhookUrl) {
      logger.error(
        { teacherId },
        'WAYL_WEBHOOK_URL is not configured — wallet topup unavailable'
      );
      throw new ApiError(
        503,
        'بوّابة الدفع غير مُهيّأة — تواصل مع الدعم',
        ErrorCodes.SERVICE_UNAVAILABLE
      );
    }

    // Reference-id format mirrors the legacy controller so existing
    // webhook-event traces / log dashboards keep parsing.
    const referenceId = `topup_${teacherId}_${Date.now()}`;
    const redirectionUrl =
      process.env['WAYL_REDIRECT_URL'] || DEFAULT_REDIRECT_FALLBACK;
    const webhookSecret = WaylService.generateSecret();
    const defaultImageUrl =
      process.env['WAYL_DEFAULT_LINEITEM_IMAGE_URL'] || DEFAULT_IMAGE_URL_FALLBACK;

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
          type: 'increase' as const,
          image: defaultImageUrl,
        },
      ],
    };

    // Persist the outbound request BEFORE calling Wayl so a transient
    // network failure still leaves an audit trail keyed by referenceId.
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

      if (!url) {
        throw new Error('Wayl create-link response missing url');
      }

      const created = await WaylPaymentLinkModel.create({
        teacherId,
        purpose: 'wallet_topup',
        amount,
        currency: 'iqd',
        referenceId,
        waylSecret: webhookSecret,
        waylUrl: url,
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

      logger.info(
        { teacherId, referenceId, amount, linkId: created.id },
        'wallet topup link created'
      );

      res
        .status(200)
        .json(ok({ url, referenceId, amount }, 'تم إنشاء رابط شحن المحفظة'));
    } catch (err) {
      await logFailure(referenceId, err);
      throw mapWaylError(err);
    }
  }
}
