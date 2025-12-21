import { Request, Response } from 'express';
import pool from '../../config/database';
import { WaylPaymentLinkModel } from '../../models/wayl-payment-link.model';
import { WaylWebhookEventModel } from '../../models/wayl-webhook-event.model';
import { TeacherWalletService } from '../../services/teacher-wallet.service';
import { WaylService } from '../../services/wayl.service';

export class WaylWebhookController {
  static async handle(req: Request, res: Response): Promise<void> {
    const signature = String(
      req.headers['x-wayl-signature-256'] ||
        req.headers['x-wayl-signature'] ||
        ''
    );
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
      await WaylWebhookEventModel.create({
        paymentLinkId: null,
        referenceId: null,
        signature,
        signatureValid: false,
        headers: req.headers,
        rawBody,
        body: req.body,
      });
      res.status(400).json({ success: false, message: 'Missing referenceId' });
      return;
    }

    const link = await WaylPaymentLinkModel.findByReferenceId(referenceId);
    if (!link) {
      await WaylWebhookEventModel.create({
        paymentLinkId: null,
        referenceId,
        signature,
        signatureValid: false,
        headers: req.headers,
        rawBody,
        body: req.body,
      });
      res.status(404).json({ success: false, message: 'Unknown referenceId' });
      return;
    }

    const ok = WaylService.verifyWebhookSignature({
      data: rawBody,
      signature,
      secret: link.wayl_secret,
    });

    const event = await WaylWebhookEventModel.create({
      paymentLinkId: link.id,
      referenceId,
      signature,
      signatureValid: ok,
      headers: req.headers,
      rawBody,
      body: req.body,
    });

    if (!ok) {
      if (event?.id) {
        await WaylWebhookEventModel.markProcessed({
          id: event.id,
          status: 'failed',
          message: 'Invalid signature',
        });
      }
      res.status(401).json({ success: false, message: 'Invalid signature' });
      return;
    }

    const status = String(
      (req.body as any)?.status ||
        (req.body as any)?.data?.status ||
        (req.body as any)?.paymentStatus ||
        (req.body as any)?.data?.paymentStatus ||
        ''
    );
    if (String(link.status) === 'paid') {
      if (event?.id) {
        await WaylWebhookEventModel.markProcessed({
          id: event.id,
          status: 'ignored',
          message: 'Already processed',
        });
      }
      res.status(200).json({ success: true, message: 'Already processed' });
      return;
    }

    const normalizedStatus = status.trim().toLowerCase();
    const isPaidStatus =
      normalizedStatus === 'paid' ||
      normalizedStatus === 'payment.paid' ||
      normalizedStatus === 'completed' ||
      normalizedStatus === 'complete';

    if (!isPaidStatus) {
      if (event?.id) {
        await WaylWebhookEventModel.markProcessed({
          id: event.id,
          status: 'ignored',
          message: `Ignored non-paid webhook (status=${normalizedStatus || 'missing'})`,
        });
      }
      res.status(200).json({
        success: true,
        message: `Ignored non-paid webhook (status=${normalizedStatus || 'missing'})`,
      });
      return;
    }

    const webhookTotalRaw =
      (req.body as any)?.total || (req.body as any)?.data?.total || undefined;
    const webhookTotal =
      webhookTotalRaw === undefined || webhookTotalRaw === null
        ? null
        : Number(webhookTotalRaw);
    if (webhookTotal !== null && Number.isFinite(webhookTotal)) {
      if (Number(link.amount) !== Number(webhookTotal)) {
        if (event?.id) {
          await WaylWebhookEventModel.markProcessed({
            id: event.id,
            status: 'failed',
            message: 'Amount mismatch',
          });
        }
        res.status(400).json({
          success: false,
          message: 'Amount mismatch',
        });
        return;
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const markR = await client.query(
        `UPDATE wayl_payment_links
         SET status = 'paid', webhook_received_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE reference_id = $1 AND status <> 'paid'`,
        [referenceId]
      );
      if ((markR.rowCount || 0) === 0) {
        await client.query('COMMIT');
        if (event?.id) {
          await WaylWebhookEventModel.markProcessed({
            id: event.id,
            status: 'ignored',
            message: 'Already processed',
          });
        }
        res.status(200).json({ success: true, message: 'Already processed' });
        return;
      }

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

        const pkgR = await client.query(
          `SELECT id, duration_days, is_active
           FROM subscription_packages
           WHERE id = $1 AND deleted_at IS NULL`,
          [pkgId]
        );
        const pkg = pkgR.rows[0];
        if (!pkg || !pkg.is_active) {
          throw new Error('الباقة غير موجودة أو غير مفعلة');
        }

        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + Number(pkg.duration_days || 30));

        await client.query(
          `INSERT INTO teacher_subscriptions (
             teacher_id, subscription_package_id, start_date, end_date, is_active
           ) VALUES ($1,$2,$3,$4,true)`,
          [link.teacher_id, pkgId, startDate, endDate]
        );
      }

      await client.query('COMMIT');
      if (event?.id) {
        await WaylWebhookEventModel.markProcessed({
          id: event.id,
          status: 'processed',
          message: 'Webhook processed',
        });
      }
      res.status(200).json({ success: true, message: 'Webhook processed' });
    } catch (e: any) {
      await client.query('ROLLBACK');
      console.error('Wayl webhook error:', {
        message: e?.message,
        stack: e?.stack,
        referenceId,
        purpose: link?.purpose,
        body: req.body,
      });
      res.status(500).json({
        success: false,
        message: e.message || 'Webhook processing failed',
      });
      if (event?.id) {
        await WaylWebhookEventModel.markProcessed({
          id: event.id,
          status: 'failed',
          message: e?.message || 'Webhook processing failed',
        });
      }
    } finally {
      client.release();
    }
  }
}
