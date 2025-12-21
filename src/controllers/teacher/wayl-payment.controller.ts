import { Request, Response } from 'express';
import { SubscriptionPackageModel } from '../../models/subscription-package.model';
import { WaylPaymentLinkModel } from '../../models/wayl-payment-link.model';
import { WaylService } from '../../services/wayl.service';

export class TeacherWaylPaymentController {
  static async createSubscriptionLink(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const teacherId = (req as any).user?.id;
      if (!teacherId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const packageId = String(req.body?.packageId || '');
      if (!packageId) {
        res
          .status(400)
          .json({ success: false, message: 'packageId is required' });
        return;
      }

      const pkg = await SubscriptionPackageModel.findById(packageId);
      if (!pkg || !pkg.isActive) {
        res
          .status(404)
          .json({ success: false, message: 'الباقة غير موجودة أو غير مفعلة' });
        return;
      }

      if (pkg.isFree || Number(pkg.price) <= 0) {
        res
          .status(400)
          .json({ success: false, message: 'هذه الباقة مجانية ولا تحتاج دفع' });
        return;
      }

      const referenceId = `sub_${teacherId}_${packageId}_${Date.now()}`;
      const secret = WaylService.generateSecret();

      const webhookUrl = process.env['WAYL_WEBHOOK_URL'];
      if (!webhookUrl) throw new Error('WAYL_WEBHOOK_URL is not configured');

      const redirectionUrl =
        process.env['WAYL_REDIRECT_URL'] ||
        'https://mulhimiq.com/teacher/dashboard';

      const payload: any = {
        referenceId,
        total: Number(pkg.price),
        currency: 'iqd',
        webhookUrl,
        redirectionUrl,
        details: {
          type: 'subscription',
          teacherId,
          subscriptionPackageId: packageId,
          amount: Number(pkg.price),
        },
        secret,
        // Some Wayl environments expect `lineItem` (singular), others accept `lineItems`.
        lineItem: [
          {
            title: `Subscription: ${pkg.name}`,
            quantity: 1,
            price: Number(pkg.price),
          },
        ],
        lineItems: [
          {
            title: `Subscription: ${pkg.name}`,
            quantity: 1,
            price: Number(pkg.price),
          },
        ],
      };

      const waylRes = await WaylService.createLink(payload);

      const url = waylRes?.data?.url || waylRes?.url;
      const waylOrderId = waylRes?.data?.id || waylRes?.id || null;
      const waylCode = waylRes?.data?.code || waylRes?.code || null;

      await WaylPaymentLinkModel.create({
        teacherId,
        purpose: 'subscription',
        subscriptionPackageId: packageId,
        amount: Number(pkg.price),
        currency: 'iqd',
        referenceId,
        waylSecret: secret,
        waylUrl: url || null,
        waylOrderId,
        waylCode,
      });

      res.status(200).json({
        success: true,
        message: 'تم إنشاء رابط الدفع',
        data: { url, referenceId },
      });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.toLowerCase().includes('invalid authentication key')) {
        res.status(400).json({
          success: false,
          message: 'Invalid authentication key',
        });
        return;
      }
      if (msg.toLowerCase().includes('missing fields')) {
        res.status(400).json({
          success: false,
          message: msg,
        });
        return;
      }
      console.error('Wayl subscription link error:', e);
      res.status(500).json({
        success: false,
        message: e.message || 'خطأ داخلي في الخادم',
      });
    }
  }

  static async createWalletTopupLink(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const teacherId = (req as any).user?.id;
      if (!teacherId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ success: false, message: 'amount must be > 0' });
        return;
      }

      const referenceId = `topup_${teacherId}_${Date.now()}`;
      const secret = WaylService.generateSecret();

      const webhookUrl = process.env['WAYL_WEBHOOK_URL'];
      if (!webhookUrl) throw new Error('WAYL_WEBHOOK_URL is not configured');

      const redirectionUrl =
        process.env['WAYL_REDIRECT_URL'] ||
        'https://mulhimiq.com/teacher/dashboard';

      const payload: any = {
        referenceId,
        total: amount,
        currency: 'iqd',
        webhookUrl,
        redirectionUrl,
        details: {
          type: 'wallet_topup',
          teacherId,
          amount,
        },
        secret,
        // Some Wayl environments expect `lineItem` (singular), others accept `lineItems`.
        lineItem: [
          {
            title: 'Wallet Top-up',
            quantity: 1,
            price: amount,
          },
        ],
        lineItems: [
          {
            title: 'Wallet Top-up',
            quantity: 1,
            price: amount,
          },
        ],
      };

      const waylRes = await WaylService.createLink(payload);
      const url = waylRes?.data?.url || waylRes?.url;
      const waylOrderId = waylRes?.data?.id || waylRes?.id || null;
      const waylCode = waylRes?.data?.code || waylRes?.code || null;

      await WaylPaymentLinkModel.create({
        teacherId,
        purpose: 'wallet_topup',
        amount,
        currency: 'iqd',
        referenceId,
        waylSecret: secret,
        waylUrl: url || null,
        waylOrderId,
        waylCode,
      });

      res.status(200).json({
        success: true,
        message: 'تم إنشاء رابط شحن المحفظة',
        data: { url, referenceId },
      });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.toLowerCase().includes('invalid authentication key')) {
        res.status(400).json({
          success: false,
          message: 'Invalid authentication key',
        });
        return;
      }
      if (msg.toLowerCase().includes('missing fields')) {
        res.status(400).json({
          success: false,
          message: msg,
        });
        return;
      }
      console.error('Wayl wallet topup link error:', e);
      res.status(500).json({
        success: false,
        message: e.message || 'خطأ داخلي في الخادم',
      });
    }
  }
}
