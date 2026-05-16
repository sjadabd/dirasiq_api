// OneSignal player-ID management. Used by every authenticated user (teacher,
// student, super-admin) on app/web init to attach a push token to their
// current session row in the `tokens` table.

import type { Request, Response } from 'express';

import { TokenModel } from '../models/token.model';
import { UserModel } from '../models/user.model';
import { ApiError, ErrorCodes } from '../utils/api-error';
import { ok } from '../utils/response.util';
import { UserType } from '../types';

const extractBearerToken = (req: Request): string | null => {
  const header = req.headers['authorization'];
  if (!header || typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
};

export class UserOneSignalController {
  // PUT /api/user/onesignal-player-id
  static async updatePlayerId(req: Request, res: Response): Promise<void> {
    const userId = req.user.id as string;
    const { oneSignalPlayerId } = req.body as { oneSignalPlayerId: string };

    const token = extractBearerToken(req);
    if (!token) {
      // `authenticateToken` should have rejected this already, but defend
      // anyway — the TokenModel.updatePlayerId call uses the token string.
      throw new ApiError(401, 'رمز المصادقة مطلوب', ErrorCodes.UNAUTHORIZED);
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      throw new ApiError(404, 'المستخدم غير موجود', ErrorCodes.NOT_FOUND);
    }

    const updated = await TokenModel.updatePlayerId(userId, token, oneSignalPlayerId);
    if (!updated) {
      throw new ApiError(
        400,
        'فشل في تحديث معرّف OneSignal لهذه الجلسة',
        ErrorCodes.INVALID_REQUEST
      );
    }

    res.status(200).json(ok(null, 'تم تحديث معرّف OneSignal بنجاح'));
  }

  // GET /api/user/onesignal-status — current user.
  static async getMyStatus(req: Request, res: Response): Promise<void> {
    const userId = req.user.id as string;
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new ApiError(404, 'المستخدم غير موجود', ErrorCodes.NOT_FOUND);
    }
    const playerId = await TokenModel.getPlayerId(userId);
    res.status(200).json(
      ok(
        {
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          userType: user.userType,
          onesignalPlayerId: playerId,
          hasOneSignalId: !!playerId,
        },
        'حالة OneSignal للمستخدم'
      )
    );
  }

  // GET /api/user/onesignal-status/:userId — super-admin only.
  static async getStatusByUserId(req: Request, res: Response): Promise<void> {
    const currentUser = req.user;
    if (currentUser.userType !== UserType.SUPER_ADMIN) {
      throw new ApiError(
        403,
        'الوصول مرفوض. هذا الإجراء مسموح للسوبر أدمن فقط',
        ErrorCodes.ROLE_REQUIRED
      );
    }
    const targetUserId = req.params['userId'] as string;
    const user = await UserModel.findById(targetUserId);
    if (!user) {
      throw new ApiError(404, 'المستخدم غير موجود', ErrorCodes.NOT_FOUND);
    }
    const playerId = await TokenModel.getPlayerId(targetUserId);
    res.status(200).json(
      ok(
        {
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          userType: user.userType,
          onesignalPlayerId: playerId,
          hasOneSignalId: !!playerId,
        },
        'حالة OneSignal للمستخدم'
      )
    );
  }
}
