// Global error middleware.
//
// Catches everything thrown / passed via `next(err)` in the request pipeline
// and produces a `fail()`-shaped response. ApiError carries the status code
// and machine-readable code; anything else is treated as an unexpected 500.
//
// This must be registered as the LAST app.use() in `src/index.ts`, after the
// 404 handler.

import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import jwt from 'jsonwebtoken';

import { ApiError, ErrorCodes, validationFailed } from '../utils/api-error';
import { fail } from '../utils/response.util';
import { logger } from '../utils/logger';

const isProduction = process.env['NODE_ENV'] === 'production';

const normalizeError = (err: unknown): ApiError => {
  if (err instanceof ApiError) return err;

  // Zod errors that escape `validate()` (rare — usually validate catches them).
  if (err instanceof ZodError) {
    const fields = err.issues.map((issue) => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message,
      code: issue.code,
    }));
    return validationFailed(fields);
  }

  // JWT errors — surface as 401 with a stable code.
  if (err instanceof jwt.TokenExpiredError) {
    return new ApiError(401, 'انتهت صلاحية الجلسة', ErrorCodes.TOKEN_EXPIRED);
  }
  if (err instanceof jwt.JsonWebTokenError) {
    return new ApiError(401, 'رمز المصادقة غير صحيح', ErrorCodes.TOKEN_INVALID);
  }

  // body-parser malformed-JSON. Body-parser throws a SyntaxError with the raw
  // bytes attached as `.body` and `type === 'entity.parse.failed'`. Surface as
  // 400 VALIDATION_ERROR with a field hint pointing at the body so clients
  // get the same envelope shape as Zod-rejected requests.
  if (
    err instanceof SyntaxError &&
    typeof err === 'object' &&
    err !== null &&
    'body' in err &&
    (err as { type?: string }).type === 'entity.parse.failed'
  ) {
    return validationFailed([
      {
        field: 'body',
        message: 'Malformed JSON in request body',
        code: 'invalid_json',
      },
    ]);
  }

  // Postgres errors — surface with stable codes where possible.
  const pgErr = err as { code?: string; message?: string };

  // undefined_table (42P01) — usually a missing migration.
  if (pgErr?.code === '42P01') {
    return new ApiError(
      503,
      isProduction
        ? 'حدث خطأ في الخادم'
        : `Database table missing (${pgErr.message ?? '42P01'}) — run npm run db:init`,
      ErrorCodes.INTERNAL_ERROR,
      { pgCode: pgErr.code },
    );
  }

  // unique violation (23505) — surface as 409.
  if (pgErr?.code === '23505') {
    return new ApiError(409, 'هذا السجل موجود بالفعل', ErrorCodes.ALREADY_EXISTS, {
      pgCode: pgErr.code,
    });
  }

  // Generic Error → 500 with cause preserved for the log.
  const message = err instanceof Error ? err.message : String(err);
  return new ApiError(
    500,
    isProduction ? 'حدث خطأ في الخادم' : message,
    ErrorCodes.INTERNAL_ERROR,
    undefined,
    { expected: false, cause: err }
  );
};

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const apiError = normalizeError(err);
  const log = req.log || logger;
  const logPayload = {
    err: apiError,
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    statusCode: apiError.statusCode,
    code: apiError.code,
  };

  if (apiError.expected) {
    log.warn(logPayload, apiError.publicMessage);
  } else {
    log.error(logPayload, apiError.publicMessage);
  }

  const body = fail(apiError.publicMessage, apiError.toResponseErrors());
  res.status(apiError.statusCode).json(body);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  const body = fail('المسار غير موجود', [
    { code: ErrorCodes.NOT_FOUND, message: `Route not found: ${req.originalUrl}` },
  ]);
  res.status(404).json(body);
};
