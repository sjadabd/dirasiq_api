// Canonical API response envelope and helpers.
//
// Every endpoint speaks this shape. Controllers should never construct a raw
// `res.status(...).json({...})` body. Instead:
//   - success path: `res.status(200).json(ok(data, message))`
//   - failure path: `throw new ApiError(...)` and let `errorHandler` produce
//     the response. Direct `fail()` calls exist only as a fallback for places
//     where ApiError isn't appropriate (e.g. a non-error message that still
//     reports `success: false`, which is rare).
//
// See `dirasiq_api/CLAUDE.md` → "API response pattern" for the documented
// contract and Phase 1 rollout status.

export interface ApiResponseError {
  /** Machine-readable code, e.g. `VALIDATION_ERROR`, `UNAUTHORIZED`. */
  code?: string;
  /** Human-readable Arabic message (default product language). */
  message: string;
  /** For field-level errors: the dotted path inside the request body. */
  field?: string;
}

export interface ApiResponsePagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponseMeta {
  pagination?: ApiResponsePagination;
  /** Reserved for additional metadata (filters, sorts, server time, etc.). */
  [key: string]: unknown;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: ApiResponseError[];
  meta?: ApiResponseMeta;
  /** Set by the post-serialize middleware in `src/index.ts`. */
  content_url?: string;
}

export const ok = <T>(
  data: T,
  message = '',
  meta?: ApiResponseMeta
): ApiResponse<T> => {
  const body: ApiResponse<T> = {
    success: true,
    message,
    data,
  };
  if (meta) body.meta = meta;
  return body;
};

export const okEmpty = (message = ''): ApiResponse<null> => ({
  success: true,
  message,
  data: null,
});

export const fail = (
  message: string,
  errors?: ApiResponseError[]
): ApiResponse<never> => {
  const body: ApiResponse<never> = {
    success: false,
    message,
  };
  if (errors && errors.length > 0) body.errors = errors;
  return body;
};

export const paginated = <T>(
  rows: T[],
  pagination: ApiResponsePagination,
  message = ''
): ApiResponse<T[]> =>
  ok(rows, message, { pagination });
