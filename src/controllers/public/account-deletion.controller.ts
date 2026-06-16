import type { Request, Response } from 'express';

import { AccountDeletionRequestModel } from '../../models/account-deletion-request.model';
import { UserModel } from '../../models/user.model';
import { accountDeletionRequestSchema } from '../../schemas/public.schemas';
import { asyncHandler } from '../../utils/async-handler';
import { okEmpty } from '../../utils/response.util';

export class PublicAccountDeletionController {
  static submit = asyncHandler(async (req: Request, res: Response) => {
    const body = accountDeletionRequestSchema.parse(req.body);
    const user = await UserModel.findByEmail(body.email);
    const userType = user?.userType ?? null;

    await AccountDeletionRequestModel.create({
      email: body.email,
      phone: body.phone,
      reason: body.reason,
      userType,
    });

    const wantsHtml =
      req.accepts(['html', 'json']) === 'html' ||
      String(req.headers['content-type'] || '').includes('application/x-www-form-urlencoded');

    if (wantsHtml) {
      const email = encodeURIComponent(body.email);
      res.redirect(302, `/delete-account?submitted=1&email=${email}`);
      return;
    }

    res.status(201).json(okEmpty('تم استلام طلبك بنجاح'));
  });
}
