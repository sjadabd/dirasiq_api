// Express middleware that verifies the X-Upload-Token header on
// teacher-application file-upload routes.
//
// Mounted only on the public upload endpoint (POST
// /api/teacher-applications/:id/files). The validator extracts the token
// from the header and runs it through `verifyUploadToken` with the URL's
// applicationId — failure routes through the global error middleware.

import type { Request, Response, NextFunction } from 'express';

import { ApiError, ErrorCodes } from '../utils/api-error';
import { verifyUploadToken } from '../utils/upload-token';

export function requireUploadToken(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token =
    (req.headers['x-upload-token'] as string | undefined) ||
    (req.headers['X-Upload-Token'] as unknown as string | undefined);

  if (!token || typeof token !== 'string') {
    return next(
      new ApiError(401, 'رمز الرفع مطلوب', ErrorCodes.UNAUTHORIZED)
    );
  }

  const applicationId = req.params['id'];
  if (!applicationId || typeof applicationId !== 'string') {
    // Route should always have :id by the time we reach this middleware.
    return next(
      new ApiError(400, 'معرف الطلب مفقود', ErrorCodes.INVALID_REQUEST)
    );
  }

  try {
    verifyUploadToken(token, applicationId);
    next();
  } catch (err) {
    next(err);
  }
}
