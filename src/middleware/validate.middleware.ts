// Zod-based request validator.
//
// Usage in a route file:
//
//   import { validate } from '@/middleware/validate.middleware';
//   import { loginSchema } from '@/schemas/auth.schemas';
//
//   router.post(
//     '/login',
//     validate({ body: loginSchema }),
//     asyncHandler(AuthController.login),
//   );
//
// Reads `body`, `params`, `query`, and `files` from the request and runs each
// against its schema. On any failure, throws ApiError(VALIDATION_ERROR, 400)
// with a per-field details list; the global error middleware turns that into
// the canonical fail() shape.
//
// On success, replaces `req.body`/`req.params`/`req.query` with the *parsed*
// values, so handlers receive coerced/transformed data (numbers from strings,
// trimmed strings, etc.).

import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';

import { validationFailed } from '../utils/api-error';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
  /** Validates the parsed `req.files` object (multer). */
  files?: ZodTypeAny;
}

interface FieldError {
  field: string;
  message: string;
  code?: string;
}

const collectIssues = (
  err: ZodError,
  source: 'body' | 'params' | 'query' | 'files'
): FieldError[] =>
  err.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : source;
    return {
      field: `${source}.${path}`,
      message: issue.message,
      code: issue.code,
    };
  });

export const validate =
  (schemas: ValidationSchemas) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const fieldErrors: FieldError[] = [];

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (result.success) {
        req.body = result.data;
      } else {
        fieldErrors.push(...collectIssues(result.error, 'body'));
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (result.success) {
        // req.params keys are always strings in Express; safe to assign.
        Object.assign(req.params, result.data);
      } else {
        fieldErrors.push(...collectIssues(result.error, 'params'));
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (result.success) {
        // Express 5 makes req.query readonly; in Express 4 it's writable, so
        // we patch the underlying values without reassigning the property.
        for (const key of Object.keys(req.query)) {
          delete (req.query as Record<string, unknown>)[key];
        }
        Object.assign(req.query as Record<string, unknown>, result.data);
      } else {
        fieldErrors.push(...collectIssues(result.error, 'query'));
      }
    }

    if (schemas.files) {
      const result = schemas.files.safeParse(req.files);
      if (!result.success) {
        fieldErrors.push(...collectIssues(result.error, 'files'));
      }
    }

    if (fieldErrors.length > 0) {
      return next(validationFailed(fieldErrors));
    }
    next();
  };
