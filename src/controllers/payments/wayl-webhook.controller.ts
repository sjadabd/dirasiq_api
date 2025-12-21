import { Request, Response } from 'express';
import pool from '../../config/database';
import { WaylPaymentLinkModel } from '../../models/wayl-payment-link.model';
import { TeacherSubscriptionService } from '../../services/teacher-subscription.service';
import { TeacherWalletService } from '../../services/teacher-wallet.service';
import { WaylService } from '../../services/wayl.service';

export class WaylWebhookController {
  static async handle(req: Request, res: Response): Promise<void> {
    const signature = String(req.headers['x-wayl-signature-256'] || '');
    const rawBody = (req as any).rawBody
      ? String((req as any).rawBody)
      : JSON.stringify(req.body || {});

    if (!signature) {
      res.status(400).json({ success: false, message: 'Missing signature' });
      return;
    }

    const referenceId = String(
      (req.body as any)?.referenceId ||
        (req.body as any)?.data?.referenceId ||
        ''
    );
    if (!referenceId) {
      res.status(400).json({ success: false, message: 'Missing referenceId' });
      return;
    }

    const link = await WaylPaymentLinkModel.findByReferenceId(referenceId);
    if (!link) {
      res.status(404).json({ success: false, message: 'Unknown referenceId' });
      return;
    }

    const ok = WaylService.verifyWebhookSignature({
      data: rawBody,
      signature,
      secret: link.wayl_secret,
    });
    if (!ok) {
      res.status(401).json({ success: false, message: 'Invalid signature' });
      return;
    }

    const status = String(
      (req.body as any)?.status || (req.body as any)?.data?.status || 'paid'
    );
    if (String(link.status) === 'paid') {
      res.status(200).json({ success: true, message: 'Already processed' });
      return;
    }

    if (status !== 'paid' && status !== 'completed') {
      res
        .status(200)
        .json({ success: true, message: 'Ignored non-paid webhook' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE wayl_payment_links
         SET status = 'paid', webhook_received_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE reference_id = $1`,
        [referenceId]
      );

      if (link.purpose === 'wallet_topup') {
        await TeacherWalletService.credit({
          teacherId: link.teacher_id,
          amount: Number(link.amount),
          referenceType: 'wayl_payment',
          referenceId: referenceId,
          client,
        });
      } else if (link.purpose === 'subscription') {
        const pkgId = link.subscription_package_id;
        if (!pkgId) throw new Error('Missing subscription_package_id');
        const result = await TeacherSubscriptionService.activateForTeacher(
          link.teacher_id,
          pkgId
        );
        if (!result.success) {
          throw new Error(result.message || 'Failed to activate subscription');
        }
      }

      await client.query('COMMIT');
      res.status(200).json({ success: true, message: 'Webhook processed' });
    } catch (e: any) {
      await client.query('ROLLBACK');
      res
        .status(500)
        .json({
          success: false,
          message: e.message || 'Webhook processing failed',
        });
    } finally {
      client.release();
    }
  }
}
