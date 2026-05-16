import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { TokenModel } from '../models/token.model';
import { UserModel } from '../models/user.model';
import { UserType } from '../types';
import { asyncHandler } from '../utils/async-handler';
import { ApiError, ErrorCodes } from '../utils/api-error';

// Extend Request interface to include user. Kept loose (`any`) for now to
// minimise blast radius during Phase 1 — a tighter `User` type can replace it
// once the controllers stop touching role-shaped properties via index access.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

const BEARER_PREFIX = /^Bearer\s+(.+)$/i;

// JWT Authentication middleware. Throws ApiError on any failure; the global
// error handler turns those into the canonical fail() response.
export const authenticateToken = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers['authorization'];
    const match = typeof authHeader === 'string' ? BEARER_PREFIX.exec(authHeader) : null;
    const token = match?.[1];

    if (!token) {
      throw new ApiError(401, 'رمز المصادقة مطلوب', ErrorCodes.UNAUTHORIZED);
    }

    const dbToken = await TokenModel.findByToken(token);
    if (!dbToken) {
      throw new ApiError(401, 'رمز المصادقة غير صحيح', ErrorCodes.TOKEN_INVALID);
    }

    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      throw new ApiError(500, 'خطأ داخلي في الخادم', ErrorCodes.INTERNAL_ERROR);
    }

    // jwt.verify throws TokenExpiredError / JsonWebTokenError — the global
    // error handler maps both to the right ApiError code.
    const decoded = jwt.verify(token, secret) as { userId?: string };
    if (!decoded.userId) {
      throw new ApiError(401, 'رمز المصادقة غير صحيح', ErrorCodes.TOKEN_INVALID);
    }

    const user = await UserModel.findById(decoded.userId);
    if (!user) {
      throw new ApiError(401, 'المستخدم غير موجود', ErrorCodes.UNAUTHORIZED);
    }

    if (user.status !== 'active') {
      throw new ApiError(401, 'الحساب غير مفعل', ErrorCodes.ACCOUNT_INACTIVE);
    }

    req.user = user;
    next();
  }
);

// Role-based authorization. `requireRole(...types)` is the canonical form;
// the named exports below are kept as thin wrappers for the existing routes
// until each route file is migrated in Phase 1.
export const requireRole =
  (...allowed: UserType[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new ApiError(401, 'المصادقة مطلوبة', ErrorCodes.UNAUTHORIZED));
    }
    if (!allowed.includes(req.user.userType)) {
      return next(
        new ApiError(403, 'الوصول مرفوض', ErrorCodes.ROLE_REQUIRED, {
          required: allowed,
        })
      );
    }
    next();
  };

export const requireSuperAdmin = requireRole(UserType.SUPER_ADMIN);
export const requireTeacher = requireRole(UserType.TEACHER);
export const requireStudent = requireRole(UserType.STUDENT);

export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    return next(new ApiError(401, 'المصادقة مطلوبة', ErrorCodes.UNAUTHORIZED));
  }
  next();
};
