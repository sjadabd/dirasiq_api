import { Request, Response } from 'express';
import pool from '../../config/database';
import { WaylPaymentLinkModel } from '../../models/wayl-payment-link.model';
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
      (req.body as any)?.status || (req.body as any)?.data?.status || ''
    );
    if (String(link.status) === 'paid') {
      res.status(200).json({ success: true, message: 'Already processed' });
      return;
    }

    const normalizedStatus = status.trim().toLowerCase();
    const isPaidStatus =
      normalizedStatus === 'paid' ||
      normalizedStatus === 'completed' ||
      normalizedStatus === 'complete';

    if (!isPaidStatus) {
      res
        .status(200)
        .json({ success: true, message: 'Ignored non-paid webhook' });
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

        const currentSubR = await client.query(
          `SELECT id, current_students
           FROM teacher_subscriptions
           WHERE teacher_id = $1 AND is_active = true AND deleted_at IS NULL
           ORDER BY created_at DESC
           LIMIT 1
           FOR UPDATE`,
          [link.teacher_id]
        );
        const currentStudents = Number(
          currentSubR.rows[0]?.current_students || 0
        );

        await client.query(
          `UPDATE teacher_subscriptions
           SET is_active = false, updated_at = CURRENT_TIMESTAMP
           WHERE teacher_id = $1 AND is_active = true AND deleted_at IS NULL`,
          [link.teacher_id]
        );

        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + Number(pkg.duration_days || 30));

        await client.query(
          `INSERT INTO teacher_subscriptions (
             teacher_id, subscription_package_id, start_date, end_date, is_active, current_students
           ) VALUES ($1,$2,$3,$4,true,$5)`,
          [link.teacher_id, pkgId, startDate, endDate, currentStudents]
        );
      }

      await client.query('COMMIT');
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
    } finally {
      client.release();
    }
  }
}
