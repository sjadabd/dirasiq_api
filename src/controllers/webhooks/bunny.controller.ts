// Bunny Stream webhook receiver — Phase 10.1.A.
//
// Bunny POSTs here every time a video changes processing state. The
// payload (raw bytes) is HMAC-SHA256-signed with `BUNNY_STREAM_WEBHOOK_SECRET`
// — we verify before doing any DB write to prevent forged status changes.
//
// Mount path: POST /api/webhooks/bunny/video-status
//
// Failure modes:
//   - rawBody not captured by the JSON parser  → 400 (defensive)
//   - signature header missing / mismatched     → 401 (fail safe)
//   - VideoGuid does not match any lesson row   → 200 + log (Bunny shouldn't
//                                                  retry; the row was deleted
//                                                  or it's an out-of-band video)
//   - status code valid + row matched           → 200 + log

import type { Request, Response } from 'express';

import { BunnyStreamService } from '../../services/bunny-stream.service';
import { VideoCourseService } from '../../services/video-course.service';
import { ok } from '../../utils/response.util';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { logger } from '../../utils/logger';
import type { BunnyWebhookInput } from '../../schemas/video-course.schemas';

export class BunnyWebhookController {
  // POST /api/webhooks/bunny/video-status
  static async videoStatus(req: Request, res: Response): Promise<void> {
    const rawBody = (req as Request & { rawBody?: string }).rawBody;

    // Always log the incoming call so we can confirm Bunny is reaching
    // us. Body is small (~120 bytes) so no PII concerns. Includes IP +
    // user-agent so we can spot forgeries vs real Bunny traffic in logs.
    logger.info(
      {
        body: req.body,
        ip: req.ip,
        ua: req.headers['user-agent'],
        hasSignature: !!(
          req.headers['bunny-webhook-signature'] ||
          req.headers['x-bunny-webhook-signature'] ||
          req.headers['authentication-signature']
        ),
        contentLength: rawBody?.length ?? 0,
      },
      '[bunny-webhook] received'
    );

    if (!rawBody) {
      // express.json `verify` should always populate this. If we get here,
      // the request didn't go through the JSON parser — abort.
      logger.warn('[bunny-webhook] rejected: rawBody missing');
      throw new ApiError(
        400,
        'Raw body unavailable for signature check',
        ErrorCodes.INVALID_REQUEST
      );
    }

    const signatureHeader =
      (req.headers['bunny-webhook-signature'] as string | undefined) ||
      (req.headers['x-bunny-webhook-signature'] as string | undefined) ||
      (req.headers['authentication-signature'] as string | undefined);

    // Schema has already normalised PascalCase (VideoGuid / Status) and
    // lowercase (videoGuid / status) aliases into a single canonical
    // shape { videoGuid, statusCode, libraryId }. The controller never
    // sees Bunny's original key casing.
    const body = req.body as BunnyWebhookInput;

    // Bunny Stream's webhook UI doesn't expose a signing-secret field
    // today, so we authenticate via (a) a token in the URL query that
    // matches BUNNY_WEBHOOK_TOKEN and (b) VideoLibraryId match. HMAC
    // mode auto-activates once Bunny ships signed webhooks and the
    // BUNNY_STREAM_WEBHOOK_SECRET env is set on both ends.
    //
    // The token query value is NEVER logged — only its presence is.
    const rawToken = req.query['token'];
    const tokenInQuery = typeof rawToken === 'string' ? rawToken : undefined;

    const auth = BunnyStreamService.verifyWebhookAuth({
      rawBody,
      signatureHeader,
      libraryIdInBody: body.libraryId,
      tokenInQuery,
      sourceIp: req.ip,
    });
    if (!auth.ok) {
      logger.warn(
        {
          reason: auth.reason,
          mode: auth.mode,
          signaturePresent: !!signatureHeader,
          tokenPresent: !!tokenInQuery,
          libraryIdInBody: body.libraryId,
          sourceIp: req.ip,
        },
        `[bunny-webhook] rejected: ${auth.reason}`
      );
      throw new ApiError(
        401,
        `Webhook auth failed: ${auth.reason}`,
        ErrorCodes.UNAUTHORIZED
      );
    }

    logger.info(
      {
        videoGuid: body.videoGuid,
        statusCode: body.statusCode,
        libraryId: body.libraryId,
        authMode: auth.mode,
      },
      `[bunny-webhook] auth OK (${auth.mode}) — applying state`
    );

    const result = await VideoCourseService.applyBunnyWebhook({
      videoGuid: body.videoGuid,
      statusCode: body.statusCode,
    });

    if (result.matched === 'lesson') {
      logger.info(
        {
          videoGuid: body.videoGuid,
          lessonId: result.lesson.id,
          courseId: result.lesson.courseId,
          newStatus: result.lesson.bunnyStatus,
        },
        '[bunny-webhook] ✅ matched lesson — realtime emit dispatched'
      );
    } else if (result.matched === 'intro-video') {
      logger.info(
        { videoGuid: body.videoGuid, userId: result.userId },
        '[bunny-webhook] ✅ matched intro-video'
      );
    } else {
      logger.warn(
        { videoGuid: body.videoGuid, statusCode: body.statusCode },
        '[bunny-webhook] ⚠️  no row matched videoGuid'
      );
    }

    // Bunny doesn't care about the shape — we always return 200 + a small
    // diagnostic JSON so curl tests can see what matched.
    const responseBody: Record<string, unknown> = {
      received: true,
      matched: result.matched !== 'none',
      kind: result.matched,
    };
    if (result.matched === 'lesson') {
      responseBody['lessonId'] = result.lesson.id;
      responseBody['status'] = result.lesson.bunnyStatus;
    } else if (result.matched === 'intro-video') {
      responseBody['userId'] = result.userId;
    }
    res.status(200).json(ok(responseBody, 'webhook received'));
  }
}
