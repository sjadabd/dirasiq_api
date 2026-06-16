import type { Request, Response } from 'express';

import {
  AccountDeletionRequestModel,
  type AccountDeletionRequestInput,
} from '../../models/account-deletion-request.model';
import { UserModel } from '../../models/user.model';
import type { AccountDeletionRequestBody } from '../../schemas/public.schemas';
import { UserType } from '../../types';
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

export class PublicAccountDeletionController {
  // POST /api/public/account-deletion-requests
  static async submit(req: Request, res: Response): Promise<void> {
    const body = req.body as AccountDeletionRequestBody;
    const user = await UserModel.findByEmail(body.email);

    const input: AccountDeletionRequestInput = {
      email: body.email,
      phone: optionalTrimmed(body.phone),
      reason: optionalTrimmed(body.reason),
      userType: normalizeUserType(user?.userType),
    };

    await AccountDeletionRequestModel.create(input);

    const wantsHtml =
      req.accepts(['html', 'json']) === 'html' ||
      String(req.headers['content-type'] || '').includes('application/x-www-form-urlencoded');

    if (wantsHtml) {
      const encodedEmail = encodeURIComponent(body.email);
      res.redirect(302, `/delete-account?submitted=1&email=${encodedEmail}`);
      return;
    }

    res.status(201).json(
      okEmpty(
        'Your account deletion request has been received. Deletion will be completed within 30 days.',
      ),
    );
  }
}
