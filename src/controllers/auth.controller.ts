// AuthController — thin HTTP layer for /api/auth/*.
//
// Phase 1 invariants this file enforces:
//   - No express-validator. Validation lives on the route via `validate(schema)`.
//   - No try/catch boilerplate. Each handler is `async`; the asyncHandler
//     wrapper on the route forwards thrown errors to the global error middleware.
//   - No bespoke `res.status(...).json(...)`. Success → `ok()` / `okEmpty()`.
//     Failure → `throw new ApiError(...)`.
//   - No `console.error`. Anything unusual is thrown; the logger picks it up.
//
// Phase 1.C completed the service-layer migration: AuthService and its
// supporting services throw `ApiError` directly. The legacy
// `unwrapServiceResult` bridge is gone.

import type { Request, Response } from 'express';

import { AppleAuthService } from '../services/apple-auth.service';
import { AuthService } from '../services/auth.service';
import { GoogleAuthService } from '../services/google-auth.service';

import { ApiError, ErrorCodes } from '../utils/api-error';
import { ok, okEmpty } from '../utils/response.util';
import {
  completeProfileStudentSchema,
  completeProfileTeacherSchema,
  updateProfileStudentSchema,
  updateProfileTeacherSchema,
} from '../schemas/auth.schemas';

export class AuthController {
  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  static async registerSuperAdmin(req: Request, res: Response): Promise<void> {
    const { name, email, password } = req.body;
    const data = await AuthService.registerSuperAdmin({ name, email, password });
    res.status(201).json(ok(data, 'تم تسجيل السوبر أدمن بنجاح'));
  }

  static async registerTeacher(req: Request, res: Response): Promise<void> {
    const data = await AuthService.registerTeacher(req.body);
    res.status(201).json(ok(data, 'تم تسجيل المعلم بنجاح'));
  }

  static async registerStudent(req: Request, res: Response): Promise<void> {
    const data = await AuthService.registerStudent(req.body);
    res.status(201).json(ok(data, 'تم تسجيل الطالب بنجاح'));
  }

  // -------------------------------------------------------------------------
  // Session
  // -------------------------------------------------------------------------

  static async login(req: Request, res: Response): Promise<void> {
    const { email, password, oneSignalPlayerId } = req.body;
    const data = await AuthService.login({ email, password, oneSignalPlayerId });
    res.status(200).json(ok(data, 'تم تسجيل الدخول بنجاح'));
  }

  static async logout(req: Request, res: Response): Promise<void> {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    if (!token) {
      throw new ApiError(400, 'رمز المصادقة مطلوب', ErrorCodes.UNAUTHORIZED);
    }
    await AuthService.logout(token);
    res.status(200).json(okEmpty('تم تسجيل الخروج بنجاح'));
  }

  // -------------------------------------------------------------------------
  // Email verification + password reset
  // -------------------------------------------------------------------------

  static async verifyEmail(req: Request, res: Response): Promise<void> {
    const { email, code } = req.body;
    await AuthService.verifyEmail(email, code);
    res.status(200).json(okEmpty('تم التحقق من البريد الإلكتروني بنجاح'));
  }

  static async resendVerificationCode(req: Request, res: Response): Promise<void> {
    const { email } = req.body;
    await AuthService.resendVerificationCode(email);
    res.status(200).json(okEmpty('تم إرسال رمز التحقق بنجاح'));
  }

  static async requestPasswordReset(req: Request, res: Response): Promise<void> {
    const { email } = req.body;
    await AuthService.requestPasswordReset(email);
    res.status(200).json(okEmpty('تم إرسال رمز إعادة تعيين كلمة المرور بنجاح'));
  }

  static async resetPassword(req: Request, res: Response): Promise<void> {
    const { email, code, newPassword } = req.body;
    await AuthService.resetPassword(email, code, newPassword);
    res.status(200).json(okEmpty('تم إعادة تعيين كلمة المرور بنجاح'));
  }

  // -------------------------------------------------------------------------
  // OAuth
  // -------------------------------------------------------------------------

  static async googleAuth(req: Request, res: Response): Promise<void> {
    const { googleToken, googleData, userType, referralCode, oneSignalPlayerId } = req.body;

    // Both verifyGoogleToken and verifyGoogleDataWithSecurity throw `ApiError`
    // on any verification failure; the asyncHandler wrapper propagates them
    // to the global error middleware.
    const verifiedGoogleData: Record<string, unknown> = googleToken
      ? (await GoogleAuthService.verifyGoogleToken(googleToken)) as any
      : await GoogleAuthService.verifyGoogleDataWithSecurity(googleData);

    if (!verifiedGoogleData?.['email'] || !verifiedGoogleData?.['name'] || !verifiedGoogleData?.['sub']) {
      throw new ApiError(400, 'بيانات Google ناقصة', ErrorCodes.INVALID_REQUEST);
    }

    if (oneSignalPlayerId) {
      verifiedGoogleData['oneSignalPlayerId'] = oneSignalPlayerId;
    } else {
      const fromGoogleData = (googleData as Record<string, unknown> | undefined)?.['oneSignalPlayerId'];
      if (fromGoogleData) verifiedGoogleData['oneSignalPlayerId'] = fromGoogleData;
    }
    if (referralCode) {
      verifiedGoogleData['referralCode'] = referralCode;
    }

    const data = await AuthService.googleAuth(verifiedGoogleData as any, userType);
    const message = data.isNewUser
      ? 'تم إنشاء الحساب وتسجيل الدخول بنجاح'
      : 'تم تسجيل الدخول بنجاح';
    res.status(200).json(ok(data, message));
  }

  static async appleAuth(req: Request, res: Response): Promise<void> {
    const { identityToken, userType, firstName, lastName, oneSignalPlayerId } = req.body;

    // Throws ApiError on any Apple-side failure.
    const payload = (await AppleAuthService.verifyIdentityToken(identityToken)) as Record<
      string,
      unknown
    >;
    const email = payload['email'] as string | undefined;
    const sub = payload['sub'] as string | undefined;
    const name =
      (payload['name'] as string | undefined) ||
      [firstName, lastName].filter(Boolean).join(' ').trim();

    if (!sub) {
      throw new ApiError(400, 'بيانات Apple ناقصة', ErrorCodes.INVALID_REQUEST);
    }
    if (!email) {
      throw new ApiError(400, 'البريد الإلكتروني من Apple غير متاح', ErrorCodes.INVALID_REQUEST);
    }

    const appleData = {
      sub,
      email,
      name: name || email.split('@')[0],
      oneSignalPlayerId,
    };

    const data = await AuthService.appleAuth(appleData as any, userType);
    const message = data.isNewUser
      ? 'تم إنشاء الحساب وتسجيل الدخول بنجاح'
      : 'تم تسجيل الدخول بنجاح';
    res.status(200).json(ok(data, message));
  }

  /**
   * Web redirect callback: /api/auth/apple-redirect?code=...&state=teacher|student
   *
   * Not validated by Zod because Apple sends form-encoded query/body params
   * that don't fit the body-schema model. Inline guards instead.
   */
  static async appleCallback(req: Request, res: Response): Promise<void> {
    const code = req.query['code'] as string | undefined;
    const state = req.query['state'] as string | undefined;
    const userTypeParam = (req.query['userType'] as string | undefined) || state;

    if (!code) {
      throw new ApiError(400, 'رمز المصادقة من Apple غير موجود', ErrorCodes.INVALID_REQUEST);
    }
    if (!userTypeParam || !['teacher', 'student'].includes(userTypeParam)) {
      throw new ApiError(400, 'نوع المستخدم غير صحيح أو غير مزود', ErrorCodes.USER_TYPE_MISMATCH);
    }

    const redirectUri = 'https://api.mulhimiq.com/api/auth/apple-redirect';
    // Throws ApiError on Apple failure.
    const exchange = await AppleAuthService.exchangeAuthorizationCode(code, redirectUri);

    const idToken = exchange?.id_token as string | undefined;
    if (!idToken) {
      throw new ApiError(400, 'لم يتم إرجاع id_token من Apple', ErrorCodes.UNAUTHORIZED);
    }

    const payload = (await AppleAuthService.verifyIdentityToken(idToken)) as Record<
      string,
      unknown
    >;
    const email = payload['email'] as string | undefined;
    const sub = payload['sub'] as string | undefined;
    const name = (payload['name'] as string | undefined) || (email ? email.split('@')[0] : undefined);

    if (!sub) throw new ApiError(400, 'بيانات Apple ناقصة', ErrorCodes.INVALID_REQUEST);
    if (!email) throw new ApiError(400, 'لم يتم توفير بريد إلكتروني من Apple', ErrorCodes.INVALID_REQUEST);

    const appleData = { sub, email, name: name || email.split('@')[0] };
    const data = await AuthService.appleAuth(appleData as any, userTypeParam as 'teacher' | 'student');
    const message = data.isNewUser
      ? 'تم إنشاء الحساب وتسجيل الدخول بنجاح'
      : 'تم تسجيل الدخول بنجاح';
    res.status(200).json(ok(data, message));
  }

  // -------------------------------------------------------------------------
  // Profile (authenticated)
  // -------------------------------------------------------------------------

  static async completeProfile(req: Request, res: Response): Promise<void> {
    const user = req.user;
    if (!user?.id || !user?.userType) {
      throw new ApiError(401, 'المصادقة مطلوبة', ErrorCodes.UNAUTHORIZED);
    }

    // Pick the right schema based on role; can't do this on the route because
    // we need req.user (which comes from authenticateToken), which runs after
    // the validate middleware would.
    const schema =
      user.userType === 'teacher'
        ? completeProfileTeacherSchema
        : user.userType === 'student'
        ? completeProfileStudentSchema
        : null;

    if (!schema) {
      throw new ApiError(403, 'الوصول مرفوض', ErrorCodes.ROLE_REQUIRED);
    }

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => ({
        field: `body.${i.path.join('.') || '(root)'}`,
        message: i.message,
        code: i.code,
      }));
      throw new ApiError(400, 'فشل في التحقق من البيانات', ErrorCodes.VALIDATION_ERROR, { fields });
    }

    const data = await AuthService.completeProfile(user.id, user.userType, parsed.data);
    res.status(200).json(ok(data, 'تم تحديث الملف الشخصي بنجاح'));
  }

  static async updateProfile(req: Request, res: Response): Promise<void> {
    const user = req.user;
    if (!user?.id || !user?.userType) {
      throw new ApiError(401, 'المصادقة مطلوبة', ErrorCodes.UNAUTHORIZED);
    }

    const schema =
      user.userType === 'teacher'
        ? updateProfileTeacherSchema
        : user.userType === 'student'
        ? updateProfileStudentSchema
        : null;

    if (!schema) {
      throw new ApiError(403, 'الوصول مرفوض', ErrorCodes.ROLE_REQUIRED);
    }

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => ({
        field: `body.${i.path.join('.') || '(root)'}`,
        message: i.message,
        code: i.code,
      }));
      throw new ApiError(400, 'فشل في التحقق من البيانات', ErrorCodes.VALIDATION_ERROR, { fields });
    }

    const data = await AuthService.updateProfile(user.id, user.userType, parsed.data);
    res.status(200).json(ok(data, 'تم تحديث البيانات بنجاح'));
  }
}
