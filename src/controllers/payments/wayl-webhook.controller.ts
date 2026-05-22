import { Request, Response } from 'express';
import pool from '../../config/database';
import { WaylPaymentLinkModel } from '../../models/wayl-payment-link.model';
import { WaylWebhookEventModel } from '../../models/wayl-webhook-event.model';
import { TeacherWalletService } from '../../services/teacher-wallet.service';
import { WaylService } from '../../services/wayl.service';

// ---------------------------------------------------------------------------
// Verification mode
// ---------------------------------------------------------------------------
// strict (default): reject any request with a missing / invalid signature.
//   This is what production must run.
// warn: log a warning but still process the webhook. Intended ONLY for
//   debugging a real Wayl integration mid-rollout.
// skip: do not verify at all. Intended ONLY for local smoke tests with
//   self-issued payloads where the raw body is hand-crafted.
type VerifyMode = 'strict' | 'warn' | 'skip';

function getVerifyMode(): VerifyMode {
  const m = (process.env['WAYL_WEBHOOK_VERIFY_MODE'] || 'strict').toLowerCase();
  if (m === 'warn' || m === 'skip' || m === 'strict') return m;
  return 'strict';
}

// Optional replay protection. If WAYL_WEBHOOK_TIMESTAMP_HEADER is set, the
// middleware will read that header from the request and reject any webhook
// whose timestamp is more than WAYL_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS
// (default 300) away from the server clock. The signature does NOT cover the
// timestamp today — this is purely an additional freshness check.
function getTimestampHeaderName(): string | null {
  const name = process.env['WAYL_WEBHOOK_TIMESTAMP_HEADER'];
  return name && name.trim() !== '' ? name.toLowerCase() : null;
}

function getTimestampToleranceSeconds(): number {
  const v = parseInt(
    process.env['WAYL_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS'] || '300',
    10,
  );
  return Number.isFinite(v) && v > 0 ? v : 300;
}

function parseTimestampHeader(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  // Allow seconds-since-epoch (10 digits) or milliseconds (13 digits).
  if (n > 1e12) return Math.floor(n / 1000);
  return Math.floor(n);
}

export class WaylWebhookController {
  static async handle(req: Request, res: Response): Promise<void> {
    const mode = getVerifyMode();

    // -----------------------------------------------------------------------
    // 0) Body-size sanity check. The global JSON parser allows 1000 MB; we
    //    clamp webhook payloads down to WAYL_WEBHOOK_MAX_BODY_BYTES
    //    (default 64 KB) to keep the attack surface small. Use Content-Length
    //    because by the time we reach here, the global parser has already
    //    parsed the body — we can't reject inside body-parser anymore.
    // -----------------------------------------------------------------------
    const maxBodyBytes = (() => {
      const v = parseInt(
        process.env['WAYL_WEBHOOK_MAX_BODY_BYTES'] || '65536',
        10,
      );
      return Number.isFinite(v) && v > 0 ? v : 65536;
    })();
    const contentLength = parseInt(
      String(req.headers['content-length'] || '0'),
      10,
    );
    if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
      res
        .status(413)
        .json({ success: false, message: 'Webhook body too large' });
      return;
    }

    // -----------------------------------------------------------------------
    // 1) Pull the signature header.
    // -----------------------------------------------------------------------
    const signature = String(
      req.headers['x-wayl-signature-256'] ||
        req.headers['x-wayl-signature'] ||
        '',
    );

    // -----------------------------------------------------------------------
    // 2) Raw body — MUST be the exact bytes Wayl signed. If express.json's
    //    verify callback didn't capture it (wrong content-type, parser
    //    bypass, etc.), we refuse rather than fall back to a re-serialization
    //    that won't match Wayl's signed bytes.
    // -----------------------------------------------------------------------
    const rawBody =
      typeof (req as any).rawBody === 'string'
        ? ((req as any).rawBody as string)
        : null;

    if (mode !== 'skip' && (rawBody === null || rawBody.length === 0)) {
      await WaylWebhookEventModel.create({
        paymentLinkId: null,
        referenceId: null,
        signature,
        signatureValid: false,
        headers: req.headers,
        rawBody: '',
        body: req.body,
      });
      res
        .status(400)
        .json({ success: false, message: 'Missing raw request body' });
      return;
    }

    // -----------------------------------------------------------------------
    // 3) Signature must be present in strict / warn mode.
    // -----------------------------------------------------------------------
    if (mode !== 'skip' && !signature) {
      await WaylWebhookEventModel.create({
        paymentLinkId: null,
        referenceId: null,
        signature: '',
        signatureValid: false,
        headers: req.headers,
        rawBody: rawBody ?? '',
        body: req.body,
      });
      if (mode === 'strict') {
        res.status(401).json({ success: false, message: 'Missing signature' });
        return;
      }
      console.warn(
        '⚠ Wayl webhook: missing signature — accepting because WAYL_WEBHOOK_VERIFY_MODE=warn',
      );
    }

    // -----------------------------------------------------------------------
    // 4) Reference ID.
    // -----------------------------------------------------------------------
    const referenceId = String(
      (req.body as any)?.referenceId ||
        (req.body as any)?.data?.referenceId ||
        '',
    );
    if (!referenceId) {
      await WaylWebhookEventModel.create({
        paymentLinkId: null,
        referenceId: null,
        signature,
        signatureValid: false,
        headers: req.headers,
        rawBody: rawBody ?? '',
        body: req.body,
      });
      res.status(400).json({ success: false, message: 'Missing referenceId' });
      return;
    }

    // -----------------------------------------------------------------------
    // 5) Look up the payment link.
    // -----------------------------------------------------------------------
    const link = await WaylPaymentLinkModel.findByReferenceId(referenceId);
    if (!link) {
      await WaylWebhookEventModel.create({
        paymentLinkId: null,
        referenceId,
        signature,
        signatureValid: false,
        headers: req.headers,
        rawBody: rawBody ?? '',
        body: req.body,
      });
      res.status(404).json({ success: false, message: 'Unknown referenceId' });
      return;
    }

    // -----------------------------------------------------------------------
    // 6) Optional timestamp / freshness check. Only enforced if
    //    WAYL_WEBHOOK_TIMESTAMP_HEADER is set AND the header is present.
    //    Wayl's own protocol may not include a timestamp; this is opt-in.
    // -----------------------------------------------------------------------
    const tsHeader = getTimestampHeaderName();
    if (mode !== 'skip' && tsHeader) {
      const tsRaw = req.headers[tsHeader];
      if (tsRaw !== undefined) {
        const ts = parseTimestampHeader(tsRaw);
        const now = Math.floor(Date.now() / 1000);
        const tolerance = getTimestampToleranceSeconds();
        if (ts === null || Math.abs(now - ts) > tolerance) {
          await WaylWebhookEventModel.create({
            paymentLinkId: link.id,
            referenceId,
            signature,
            signatureValid: false,
            headers: req.headers,
            rawBody: rawBody ?? '',
            body: req.body,
          });
          if (mode === 'strict') {
            res.status(401).json({
              success: false,
              message: 'Webhook timestamp out of tolerance window',
            });
            return;
          }
          console.warn(
            `⚠ Wayl webhook: timestamp out of tolerance (now=${now}, header=${ts ?? 'unparsable'}, tolerance=${tolerance}s) — accepting because mode=warn`,
          );
        }
      }
    }

    // -----------------------------------------------------------------------
    // 7) Verify signature against the per-link secret.
    // -----------------------------------------------------------------------
    let signatureValid = false;
    if (mode === 'skip') {
      signatureValid = true;
    } else if (signature && rawBody !== null) {
      signatureValid = WaylService.verifyWebhookSignature({
        data: rawBody,
        signature,
        secret: link.wayl_secret,
      });
    }

    const event = await WaylWebhookEventModel.create({
      paymentLinkId: link.id,
      referenceId,
      signature,
      signatureValid,
      headers: req.headers,
      rawBody: rawBody ?? '',
      body: req.body,
    });

    if (!signatureValid && mode === 'strict') {
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
    if (!signatureValid && mode === 'warn') {
      console.warn(
        `⚠ Wayl webhook: INVALID signature for referenceId=${referenceId} — processing anyway because WAYL_WEBHOOK_VERIFY_MODE=warn`,
      );
    }

    // -----------------------------------------------------------------------
    // 8) Business logic: status check, idempotency, amount, fulfilment.
    // -----------------------------------------------------------------------
    const status = String(
      (req.body as any)?.status ||
        (req.body as any)?.data?.status ||
        (req.body as any)?.paymentStatus ||
        (req.body as any)?.data?.paymentStatus ||
        '',
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
        [referenceId],
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
      } else {
        // (Phase 7) The 'subscription' purpose was removed alongside the
        // legacy subscription system. Course-purchase ('enrollment')
        // handling will be wired here in Phase 14 once the new
        // video-course flow lands. Any unrecognised purpose is logged
        // server-side and the webhook is acked as ignored (so Wayl does
        // not retry forever).
        console.warn('Wayl webhook: ignored unknown purpose', {
          referenceId,
          purpose: link.purpose,
        });
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
