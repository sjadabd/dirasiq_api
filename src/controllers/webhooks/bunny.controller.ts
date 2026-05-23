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
import type { BunnyWebhookInput } from '../../schemas/video-course.schemas';

export class BunnyWebhookController {
  // POST /api/webhooks/bunny/video-status
  static async videoStatus(req: Request, res: Response): Promise<void> {
    const rawBody = (req as Request & { rawBody?: string }).rawBody;
    if (!rawBody) {
      // express.json `verify` should always populate this. If we get here,
      // the request didn't go through the JSON parser — abort.
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

    const ok2 = BunnyStreamService.verifyWebhookSignature({
      rawBody,
      signatureHeader,
    });
    if (!ok2) {
      throw new ApiError(
        401,
        'Invalid webhook signature',
        ErrorCodes.UNAUTHORIZED
      );
    }

    const body = req.body as BunnyWebhookInput;
    const result = await VideoCourseService.applyBunnyWebhook({
      videoGuid: body.VideoGuid,
      statusCode: body.Status,
    });

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
