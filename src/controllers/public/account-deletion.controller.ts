import type { Request, Response } from 'express';

import {
  AccountDeletionRequestModel,
  type AccountDeletionRequestInput,
} from '../../models/account-deletion-request.model';
import { UserModel } from '../../models/user.model';
import type { AccountDeletionRequestBody } from '../../schemas/public.schemas';
import { UserType } from '../../types';
import { logger } from '../../utils/logger';
import { okEmpty } from '../../utils/response.util';

function optionalTrimmed(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeUserType(userType: UserType | null | undefined): string | null {
  if (userType === UserType.STUDENT || userType === UserType.TEACHER) {
    return userType;
  }
  return null;
}

function isHtmlFormPost(req: Request, body: AccountDeletionRequestBody): boolean {
  if (body.source === 'delete-account-page') return true;

  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    return true;
  }

  const referer = String(
    req.headers.referer || req.headers['referrer'] || '',
  ).toLowerCase();
  return referer.includes('/delete-account');
}

export class PublicAccountDeletionController {
  // POST /api/public/account-deletion-requests
  static async submit(req: Request, res: Response): Promise<void> {
    const body = req.body as AccountDeletionRequestBody;
    const htmlForm = isHtmlFormPost(req, body);

    try {
      let userType: string | null = null;
      try {
        const user = await UserModel.findByEmail(body.email);
        userType = normalizeUserType(user?.userType);
      } catch (lookupErr) {
        logger.warn(
          { err: lookupErr, email: body.email },
          'account deletion: user lookup failed; continuing without user_type',
        );
      }

      const input: AccountDeletionRequestInput = {
        email: body.email,
        phone: optionalTrimmed(body.phone),
        reason: optionalTrimmed(body.reason),
        userType,
      };

      await AccountDeletionRequestModel.create(input);

      if (htmlForm) {
        const encodedEmail = encodeURIComponent(body.email);
        res.redirect(302, `/delete-account?submitted=1&email=${encodedEmail}`);
        return;
      }

      res.status(201).json(
        okEmpty(
          'Your account deletion request has been received. Deletion will be completed within 30 days.',
        ),
      );
    } catch (err) {
      logger.error({ err, email: body.email, htmlForm }, 'account deletion submit failed');

      if (htmlForm) {
        const encodedEmail = encodeURIComponent(optionalTrimmed(body.email) ?? '');
        const suffix = encodedEmail ? `&email=${encodedEmail}` : '';
        res.redirect(302, `/delete-account?error=1${suffix}`);
        return;
      }
      throw err;
    }
  }
}
