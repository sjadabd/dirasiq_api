// internalSecret middleware — gates /api/internal/* behind a shared header.
//
// Used by the chat service (and any future internal consumer) to pull
// user-profile data from the main app without an end-user token. The secret
// lives in `INTERNAL_API_SECRET` on both sides; comparison is constant-time
// to avoid timing-based brute-force.
//
// Failure modes (all return canonical fail() envelope via the global error
// middleware):
//   - INTERNAL_API_SECRET unset in env  → 503 SERVICE_UNAVAILABLE
//   - missing header                    → 401 UNAUTHORIZED
//   - header mismatch                   → 401 UNAUTHORIZED

import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

import { ApiError, ErrorCodes } from '../utils/api-error';

const HEADER = 'X-Internal-Secret';

export const requireInternalSecret = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const expected = process.env['INTERNAL_API_SECRET'];
  if (!expected) {
    return next(
      new ApiError(503, 'Internal API not configured', ErrorCodes.SERVICE_UNAVAILABLE)
    );
  }

  const provided = req.header(HEADER);
  if (!provided) {
    return next(
      new ApiError(401, 'Missing internal secret', ErrorCodes.UNAUTHORIZED)
    );
  }

  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return next(
      new ApiError(401, 'Invalid internal secret', ErrorCodes.UNAUTHORIZED)
    );
  }

  next();
};
