// ApiError — the canonical way for controllers/services to signal a failure
// that should turn into an HTTP response.
//
// Throw it from anywhere in the request pipeline; the global error handler
// (`src/middleware/error.middleware.ts`) catches it, logs it with the request
// id, and formats it through the `fail()` response helper.
//
// Status code, public message (Arabic-first, safe to show users), machine
// code (stable, for clients to branch on), and an optional `details` payload
// (for VALIDATION_ERROR's field list and similar structured data).

import type { ApiResponseError } from './response.util';

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly publicMessage: string;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;
  /** When true, the global logger emits at `warn` instead of `error`. */
  public readonly expected: boolean;

  constructor(
    statusCode: number,
    publicMessage: string,
    code: string,
    details?: Record<string, unknown>,
    options: { expected?: boolean; cause?: unknown } = {}
  ) {
    super(publicMessage);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.publicMessage = publicMessage;
    this.code = code;
    if (details !== undefined) this.details = details;
    this.expected = options.expected ?? statusCode < 500;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }

  /** Convert to the `errors[]` array consumed by `fail()`. */
  toResponseErrors(): ApiResponseError[] {
    const baseError: ApiResponseError = {
      code: this.code,
      message: this.publicMessage,
    };

    // For VALIDATION_ERROR-style field lists, surface them in the errors[] array
    // (one entry per field) so clients can map them to form fields directly.
    if (Array.isArray(this.details?.['fields'])) {
      const fields = this.details['fields'] as Array<{
        field: string;
        message: string;
        code?: string;
      }>;
      if (fields.length > 0) {
        return fields.map((f) => ({
          code: f.code || this.code,
          message: f.message,
          field: f.field,
        }));
      }
    }

    return [baseError];
  }
}

/**
 * Standard machine-readable error codes. Used by clients to branch on failures
 * without parsing Arabic strings. Add new codes as needed; never rename existing
 * ones without a coordinated client update.
 */
export const ErrorCodes = {
  // Validation / shape
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_REQUEST: 'INVALID_REQUEST',
  MISSING_FIELD: 'MISSING_FIELD',

  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  PROVIDER_MISMATCH: 'PROVIDER_MISMATCH',
  USER_TYPE_MISMATCH: 'USER_TYPE_MISMATCH',

  // OTP / verification
  INVALID_CODE: 'INVALID_CODE',
  CODE_EXPIRED: 'CODE_EXPIRED',
  CODE_LOCKED: 'CODE_LOCKED',

  // Authorization
  FORBIDDEN: 'FORBIDDEN',
  ROLE_REQUIRED: 'ROLE_REQUIRED',

  // Resource lifecycle
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  ALREADY_PROCESSED: 'ALREADY_PROCESSED',

  // Business rules
  BUSINESS_RULE: 'BUSINESS_RULE',
  CAPACITY_EXCEEDED: 'CAPACITY_EXCEEDED',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  SUPER_ADMIN_EXISTS: 'SUPER_ADMIN_EXISTS',

  // Payments
  PAYMENT_SIGNATURE_INVALID: 'PAYMENT_SIGNATURE_INVALID',
  PAYMENT_AMOUNT_MISMATCH: 'PAYMENT_AMOUNT_MISMATCH',

  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',

  // External
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
  GEOCODING_FAILED: 'GEOCODING_FAILED',

  // Catch-all
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ---- Factory helpers (cheap, optional — `new ApiError(...)` is always fine) ----

export const badRequest = (message: string, code: ErrorCode = ErrorCodes.INVALID_REQUEST, details?: Record<string, unknown>) =>
  new ApiError(400, message, code, details);

export const validationFailed = (
  fields: Array<{ field: string; message: string; code?: string }>,
  message = 'فشل في التحقق من البيانات'
) =>
  new ApiError(400, message, ErrorCodes.VALIDATION_ERROR, { fields });

export const unauthorized = (message = 'المصادقة مطلوبة', code: ErrorCode = ErrorCodes.UNAUTHORIZED) =>
  new ApiError(401, message, code);

export const forbidden = (message = 'الوصول مرفوض', code: ErrorCode = ErrorCodes.FORBIDDEN) =>
  new ApiError(403, message, code);

export const notFound = (message = 'المورد غير موجود', code: ErrorCode = ErrorCodes.NOT_FOUND) =>
  new ApiError(404, message, code);

export const conflict = (message: string, code: ErrorCode = ErrorCodes.CONFLICT) =>
  new ApiError(409, message, code);

export const internal = (message = 'حدث خطأ في الخادم', cause?: unknown) =>
  new ApiError(500, message, ErrorCodes.INTERNAL_ERROR, undefined, { expected: false, cause });
