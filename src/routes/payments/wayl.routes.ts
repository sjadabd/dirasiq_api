// /api/payments/wayl/webhook — PUBLIC, called by Wayl's payment gateway.
//
// We DO NOT pass this controller through the canonical `ok()` / `fail()`
// envelope: Wayl's webhook spec expects the existing minimal response shape
// (`{success, message}` plus the per-status fields the controller already
// emits). Changing it could break payment fulfilment, and the Phase-0 HMAC
// hardening already returns the right HTTP status codes.
//
// What we DO add here:
//   - `validate({ body: waylWebhookBodySchema })` — a minimal Zod gate that
//     requires `referenceId` so the controller can short-circuit malformed
//     payloads before the HMAC check runs.
//   - `asyncHandler` — so unexpected throws inside the controller flow to
//     the global error middleware instead of crashing the request.

import { Router } from 'express';

import { WaylWebhookController } from '../../controllers/payments/wayl-webhook.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { waylWebhookBodySchema } from '../../schemas/misc.schemas';

const router = Router();

router.post(
  '/webhook',
  validate({ body: waylWebhookBodySchema }),
  asyncHandler(WaylWebhookController.handle)
);

export default router;
