// Upload-token issuance + verification for teacher-application file uploads.
//
// The applicant doesn't have a user account yet, so they can't authenticate
// with the normal JWT. Instead, the public submit endpoint returns a short-
// lived (30 minutes) token scoped to a specific applicationId. The Flutter
// app stores it in memory only and presents it with every file upload.
//
// Token shape: standard JWT signed with JWT_SECRET, carrying:
//   - purpose: 'app_upload'   — narrows the token to this single use case
//   - aid:     <applicationId>
//   - exp:     issuance + UPLOAD_TOKEN_TTL_SECONDS
//
// Verification rejects:
//   - missing / malformed token            → 401 UNAUTHORIZED
//   - signature mismatch / expired          → 401 TOKEN_INVALID / TOKEN_EXPIRED
//   - purpose !== 'app_upload'              → 401 TOKEN_INVALID
//   - aid !== request param :id             → 403 FORBIDDEN
//
// The token can be reused for multiple file uploads inside the 30-minute
// window — that's intentional, the Flutter app uploads 3–5 files in sequence.

import jwt from 'jsonwebtoken';

import { ApiError, ErrorCodes } from './api-error';

const UPLOAD_TOKEN_TTL_SECONDS = 30 * 60; // 30 minutes
const TOKEN_PURPOSE = 'app_upload' as const;

interface UploadTokenPayload {
  purpose: typeof TOKEN_PURPOSE;
  aid: string;
}

function getSecret(): string {
  const s = process.env['JWT_SECRET'];
  if (!s) {
    throw new ApiError(
      500,
      'JWT_SECRET غير مهيأ',
      ErrorCodes.INTERNAL_ERROR
    );
  }
  return s;
}

export function signUploadToken(applicationId: string): {
  token: string;
  expiresInSeconds: number;
} {
  const payload: UploadTokenPayload = {
    purpose: TOKEN_PURPOSE,
    aid: applicationId,
  };
  const token = jwt.sign(payload, getSecret(), {
    expiresIn: UPLOAD_TOKEN_TTL_SECONDS,
  });
  return { token, expiresInSeconds: UPLOAD_TOKEN_TTL_SECONDS };
}

/**
 * Decode + validate an upload token. Returns the applicationId the token
 * was issued for. Throws `ApiError` on any failure mode.
 */
export function verifyUploadToken(token: string, expectedApplicationId: string): string {
  let decoded: jwt.JwtPayload | string;
  try {
    decoded = jwt.verify(token, getSecret());
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new ApiError(
        401,
        'انتهت صلاحية رمز الرفع — يرجى إعادة المحاولة',
        ErrorCodes.TOKEN_EXPIRED
      );
    }
    throw new ApiError(
      401,
      'رمز الرفع غير صحيح',
      ErrorCodes.TOKEN_INVALID
    );
  }

  if (typeof decoded === 'string') {
    throw new ApiError(401, 'رمز الرفع غير صحيح', ErrorCodes.TOKEN_INVALID);
  }
  if (decoded['purpose'] !== TOKEN_PURPOSE) {
    throw new ApiError(401, 'رمز الرفع غير صحيح', ErrorCodes.TOKEN_INVALID);
  }
  const aid = decoded['aid'];
  if (typeof aid !== 'string' || aid !== expectedApplicationId) {
    throw new ApiError(
      403,
      'رمز الرفع غير مخصص لهذا الطلب',
      ErrorCodes.FORBIDDEN
    );
  }
  return aid;
}
