import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { sendPasswordResetEmail, sendVerificationEmail } from '../config/email';
import { GradeModel } from '../models/grade.model';
import { StudentGradeModel } from '../models/student-grade.model';
import { TeacherGradeModel } from '../models/teacher-grade.model';
import { TokenModel } from '../models/token.model';
import { UserModel } from '../models/user.model';
import { GeocodingService } from '../services/geocoding.service';
import { QrService } from '../services/qr.service';
import { AcademicYearService } from '../services/super_admin/academic-year.service';
import {
  LoginRequest,
  RegisterStudentRequest,
  RegisterSuperAdminRequest,
  RegisterTeacherRequest,
  User,
  UserStatus,
  UserType,
} from '../types';
import { ApiError, ErrorCodes } from '../utils/api-error';
import { ImageService } from '../utils/image.service';
import { logger } from '../utils/logger';

// Canonical return for OAuth login/signup flows. The `isNewUser` discriminator
// lets the controller pick the right success message ("login successful" vs
// "account created") without baking message strings into the service layer.
export type OAuthResult = {
  user: any;
  token: string;
  isNewUser: boolean;
  isProfileComplete: boolean;
  requiresProfileCompletion: boolean;
  activeAcademicYear: unknown;
};

export class AuthService {
  private static teacherTokenTtlDays(): number {
    const parsed = parseInt(process.env['TEACHER_TOKEN_TTL_DAYS'] || '30', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
  }

  private static teacherTokenExpiry(now = new Date()): {
    expiresAt: Date;
    expiresInSeconds: number;
  } {
    const days = AuthService.teacherTokenTtlDays();
    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return { expiresAt, expiresInSeconds: days * 24 * 60 * 60 };
  }

  /**
   * Phase 8 — block login / OAuth-provisioning for an email that already
   * has a teacher application on file. Without this, a Google sign-in by
   * an applicant whose application is still pending would silently mint a
   * student account behind the scenes and ask them for student profile
   * data — completely wrong.
   *
   * Called by `login`, `googleAuth`, `appleAuth` only when no `users` row
   * exists for the email (i.e. we're about to either reject or create one).
   * Existing-user paths are unchanged.
   */
  private static async assertNoBlockingApplication(email: string): Promise<void> {
    if (!email) return;
    const { rows } = await pool.query<{
      application_status: string;
      rejection_reason: string | null;
    }>(
      `SELECT application_status, rejection_reason
         FROM teacher_applications
        WHERE email = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1`,
      [email.toLowerCase()]
    );
    if (rows.length === 0) return;
    const app = rows[0]!;
    switch (app.application_status) {
      case 'pending':
        throw new ApiError(
          403,
          'طلب الانضمام كأستاذ قيد المراجعة. سنقوم بإشعارك عند الموافقة.',
          ErrorCodes.BUSINESS_RULE,
          { applicationStatus: 'pending' }
        );
      case 'needs_more_info':
        throw new ApiError(
          403,
          'طلبك يحتاج معلومات إضافية من الإدارة. يرجى مراجعة طلبك وإكمال المطلوب.',
          ErrorCodes.BUSINESS_RULE,
          { applicationStatus: 'needs_more_info' }
        );
      case 'rejected':
        throw new ApiError(
          403,
          app.rejection_reason
            ? `تم رفض طلب الانضمام كأستاذ: ${app.rejection_reason}`
            : 'تم رفض طلب الانضمام كأستاذ',
          ErrorCodes.BUSINESS_RULE,
          {
            applicationStatus: 'rejected',
            rejectionReason: app.rejection_reason ?? null,
          }
        );
      case 'approved':
        // Approved AND no users row found → provisioning glitch. Don't
        // create a student silently — log + error.
        logger.error(
          { email },
          'CRITICAL: approved teacher application has no matching users row'
        );
        throw new ApiError(
          500,
          'حدث خطأ في تفعيل الحساب، يرجى مراجعة الإدارة',
          ErrorCodes.INTERNAL_ERROR
        );
      default:
        return;
    }
  }

  static async registerSuperAdmin(
    data: RegisterSuperAdminRequest
  ): Promise<{ user: any }> {
    if (await UserModel.superAdminExists()) {
      throw new ApiError(
        400,
        'السوبر أدمن موجود بالفعل',
        ErrorCodes.SUPER_ADMIN_EXISTS
      );
    }
    const { user: superAdmin } = await UserModel.create({
      name: data.name,
      email: data.email,
      password: data.password,
      userType: UserType.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    });
    return { user: this.sanitizeUser(superAdmin) };
  }

  /**
   * Apple Sign-In: log in or create a user from a verified Apple identity
   * payload. The discriminator `isNewUser` lets the controller pick the
   * right success message ("login successful" vs "account created").
   */
  static async appleAuth(
    appleData: any,
    userType: 'teacher' | 'student'
  ): Promise<OAuthResult> {
    const { email, name, sub } = appleData;
    const existingUser = await UserModel.findByEmail(email);

    if (existingUser) {
      if (existingUser.authProvider !== 'apple') {
        throw new ApiError(
          409,
          'قمت بانشاء الحساب باستخدام طريقة أخرى الرجاء تسجيل الدخول بنفس الطريقة',
          ErrorCodes.PROVIDER_MISMATCH
        );
      }
      const expected =
        userType === 'teacher' ? UserType.TEACHER : UserType.STUDENT;
      if (existingUser.userType !== expected) {
        throw new ApiError(
          409,
          'نوع المستخدم لا يتطابق مع الحساب الموجود',
          ErrorCodes.USER_TYPE_MISMATCH
        );
      }

      try {
        if (existingUser.userType === UserType.TEACHER) {
          await QrService.ensureTeacherQr(existingUser.id);
        }
      } catch (err) {
        logger.warn({ err }, 'auto-ensure teacher QR on apple login failed');
      }

      return this.buildOAuthSession(
        existingUser,
        appleData.oneSignalPlayerId,
        false
      );
    }

    // No matching user — sign-up path. Phase 8 — refuse if the email is
    // tied to an existing teacher_application so we never silently mint a
    // student account for an in-progress applicant.
    await this.assertNoBlockingApplication(email);

    // Teacher provisioning via Apple is closed (Phase 1 onboarding policy);
    // teachers must come through the application flow.
    if (userType === 'teacher') {
      throw new ApiError(
        403,
        'يرجى تقديم طلب الانضمام كأستاذ أولاً، وبعد الموافقة يمكنك تسجيل الدخول.',
        ErrorCodes.BUSINESS_RULE
      );
    }

    // Student provisioning. Throwaway password — auth runs through Apple.
    const tempPassword = `apple_${sub}_${randomUUID()}`;
    const hashedPassword = await bcrypt.hash(tempPassword, 12);
    const { user: newUser } = await UserModel.create({
      name,
      email,
      password: hashedPassword,
      userType: UserType.STUDENT,
      status: UserStatus.ACTIVE,
      authProvider: 'apple',
      oauthProviderId: sub,
      studentPhone: '',
      parentPhone: '',
      schoolName: '',
    });

    return this.buildOAuthSession(newUser, appleData.oneSignalPlayerId, true);
  }

  // Register teacher
  static async registerTeacher(
    data: RegisterTeacherRequest
  ): Promise<{ user: Partial<User> }> {
    // Normalize email and pre-check duplicates. PROVIDER_MISMATCH is a
    // distinct error code so the client can suggest the correct sign-in path.
    const emailLower = (data.email || '').toLowerCase();
    const existingProvider =
      await UserModel.getAuthProviderByEmail(emailLower);
    if (existingProvider === 'google') {
      throw new ApiError(
        409,
        'هذا البريد مسجّل عبر Google، الرجاء تسجيل الدخول باستخدام Google',
        ErrorCodes.PROVIDER_MISMATCH
      );
    }
    if (existingProvider) {
      throw new ApiError(
        409,
        'البريد الإلكتروني مستخدم مسبقاً',
        ErrorCodes.EMAIL_ALREADY_EXISTS
      );
    }

    const teacherData: Partial<User> = {
      name: data.name,
      email: emailLower,
      password: data.password,
      userType: UserType.TEACHER,
      status: UserStatus.PENDING,
    };

    if (data.phone) teacherData.phone = data.phone;
    if (data.address) teacherData.address = data.address;
    if (data.bio) teacherData.bio = data.bio;
    if (data.experienceYears)
      teacherData.experienceYears = data.experienceYears;
    if (data.visitorId) teacherData.visitorId = data.visitorId;
    if (data.deviceInfo) teacherData.deviceInfo = data.deviceInfo;
    if (data.latitude !== undefined) teacherData.latitude = data.latitude;
    if (data.longitude !== undefined) teacherData.longitude = data.longitude;

    if (data.formattedAddress)
      teacherData.formattedAddress = data.formattedAddress;
    if (data.country) teacherData.country = data.country;
    if (data.city) teacherData.city = data.city;
    if (data.state) teacherData.state = data.state;
    if (data.zipcode) teacherData.zipcode = data.zipcode;
    if (data.streetName) teacherData.streetName = data.streetName;
    if (data.suburb) teacherData.suburb = data.suburb;
    if (data.locationConfidence !== undefined)
      teacherData.locationConfidence = data.locationConfidence;

    // Best-effort geocoding — if it fails we still create the account; the
    // client can complete location details later via /complete-profile.
    if (data.latitude && data.longitude && !data.formattedAddress) {
      try {
        const geocodingService = new GeocodingService();
        const locationDetails = await geocodingService.getLocationDetails(
          data.latitude,
          data.longitude
        );

        if (locationDetails) {
          teacherData.formattedAddress = locationDetails.formattedAddress;
          teacherData.country = locationDetails.country;
          teacherData.city = locationDetails.city;
          teacherData.state = locationDetails.state;
          teacherData.zipcode = locationDetails.zipcode;
          teacherData.streetName = locationDetails.streetName;
          teacherData.suburb = locationDetails.suburb;
          teacherData.locationConfidence = locationDetails.confidence;
        }
      } catch (err) {
        logger.warn({ err }, 'geocoding failed during teacher registration');
      }
    }

    let teacher: User;
    let plaintextVerificationCode: string | null | undefined;
    try {
      const created = await UserModel.create(teacherData);
      teacher = created.user;
      plaintextVerificationCode = created.plaintextVerificationCode;
    } catch (err) {
      // Race: someone registered with the same email between the precheck and
      // the INSERT. Translate the unique-violation marker to a 409.
      if (err instanceof Error && err.message === 'EMAIL_ALREADY_EXISTS') {
        throw new ApiError(
          409,
          'البريد الإلكتروني مستخدم مسبقاً',
          ErrorCodes.EMAIL_ALREADY_EXISTS
        );
      }
      throw err;
    }

    // (Phase 7) Free-subscription auto-grant removed — the subscription
    // model is replaced by commission + wallet.

    // Best-effort: create teacher↔grade relationships.
    if (data.gradeIds && data.gradeIds.length > 0 && data.studyYear) {
      try {
        await TeacherGradeModel.createMany(
          teacher.id,
          data.gradeIds,
          data.studyYear
        );
      } catch (err) {
        logger.warn({ err }, 'failed to create teacher grade relationships');
      }
    }

    // Email delivery is part of the contract — if we can't deliver the OTP
    // the account is unreachable. Surface this as a 502.
    const emailSent = await sendVerificationEmail(
      data.email,
      plaintextVerificationCode || '',
      data.name,
    );
    if (!emailSent) {
      throw new ApiError(
        502,
        'فشل في إرسال البريد الإلكتروني',
        ErrorCodes.EMAIL_SEND_FAILED
      );
    }

    return { user: this.sanitizeUser(teacher) };
  }

  // Register student
  static async registerStudent(
    data: RegisterStudentRequest
  ): Promise<{ user: Partial<User> }> {
    const emailLower = (data.email || '').toLowerCase();
    const existingProvider =
      await UserModel.getAuthProviderByEmail(emailLower);
    if (existingProvider === 'google') {
      throw new ApiError(
        409,
        'هذا البريد مسجّل عبر Google، الرجاء تسجيل الدخول باستخدام Google',
        ErrorCodes.PROVIDER_MISMATCH
      );
    }
    if (existingProvider) {
      throw new ApiError(
        409,
        'البريد الإلكتروني مستخدم مسبقاً',
        ErrorCodes.EMAIL_ALREADY_EXISTS
      );
    }

    const studentData: Partial<User> = {
      name: data.name,
      email: emailLower,
      password: data.password,
      userType: UserType.STUDENT,
      status: UserStatus.PENDING,
    };

    if (data.studentPhone) studentData.studentPhone = data.studentPhone;
    if (data.parentPhone) studentData.parentPhone = data.parentPhone;
    if (data.schoolName) studentData.schoolName = data.schoolName;
    if (data.gender) studentData.gender = data.gender;
    if (data.birthDate) studentData.birthDate = new Date(data.birthDate);
    if (data.latitude !== undefined) studentData.latitude = data.latitude;
    if (data.longitude !== undefined) studentData.longitude = data.longitude;

    if (data.formattedAddress)
      studentData.formattedAddress = data.formattedAddress;
    if (data.country) studentData.country = data.country;
    if (data.city) studentData.city = data.city;
    if (data.state) studentData.state = data.state;
    if (data.zipcode) studentData.zipcode = data.zipcode;
    if (data.streetName) studentData.streetName = data.streetName;
    if (data.suburb) studentData.suburb = data.suburb;
    if (data.locationConfidence !== undefined)
      studentData.locationConfidence = data.locationConfidence;

    // Best-effort geocoding.
    if (data.latitude && data.longitude && !data.formattedAddress) {
      try {
        const geocodingService = new GeocodingService();
        const locationDetails = await geocodingService.getLocationDetails(
          data.latitude,
          data.longitude
        );

        if (locationDetails) {
          studentData.formattedAddress = locationDetails.formattedAddress;
          studentData.country = locationDetails.country;
          studentData.city = locationDetails.city;
          studentData.state = locationDetails.state;
          studentData.zipcode = locationDetails.zipcode;
          studentData.streetName = locationDetails.streetName;
          studentData.suburb = locationDetails.suburb;
          studentData.locationConfidence = locationDetails.confidence;
        }
      } catch (err) {
        logger.warn({ err }, 'geocoding failed during student registration');
      }
    }

    let student: User;
    let plaintextVerificationCode: string | null | undefined;
    try {
      const created = await UserModel.create(studentData);
      student = created.user;
      plaintextVerificationCode = created.plaintextVerificationCode;
    } catch (err) {
      if (err instanceof Error && err.message === 'EMAIL_ALREADY_EXISTS') {
        throw new ApiError(
          409,
          'البريد الإلكتروني مستخدم مسبقاً',
          ErrorCodes.EMAIL_ALREADY_EXISTS
        );
      }
      throw err;
    }

    // Best-effort: student↔grade relationship.
    try {
      await StudentGradeModel.create({
        studentId: student.id,
        gradeId: data.gradeId,
        studyYear: data.studyYear,
      });
    } catch (err) {
      logger.warn({ err }, 'failed to create student grade relationship');
    }

    const emailSent = await sendVerificationEmail(
      data.email,
      plaintextVerificationCode || '',
      data.name,
    );
    if (!emailSent) {
      throw new ApiError(
        502,
        'فشل في إرسال البريد الإلكتروني',
        ErrorCodes.EMAIL_SEND_FAILED
      );
    }

    return { user: this.sanitizeUser(student) };
  }

  static async login(data: LoginRequest): Promise<{
    user: any;
    token: string;
    isProfileComplete: boolean;
    requiresProfileCompletion: boolean;
    activeAcademicYear: unknown;
  }> {
    const user = await UserModel.findByEmail(data.email);
    if (!user) {
      // No user row yet. Before returning the generic 401, check whether
      // this email is sitting in teacher_applications — if so, give a
      // status-aware message so the applicant knows where they stand.
      await this.assertNoBlockingApplication(data.email);
      throw new ApiError(401, 'بيانات الدخول غير صحيحة', ErrorCodes.INVALID_CREDENTIALS);
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ApiError(
        401,
        'الحساب غير مفعل، يرجى التحقق من بريدك الإلكتروني أو التواصل مع الدعم',
        ErrorCodes.ACCOUNT_INACTIVE
      );
    }
    if (user.authProvider && user.authProvider !== 'email') {
      throw new ApiError(
        401,
        'قمت بإنشاء الحساب باستخدام مزود خارجي الرجاء تسجيل الدخول بنفس الطريقة',
        ErrorCodes.PROVIDER_MISMATCH
      );
    }
    const isPasswordValid = await bcrypt.compare(data.password, user.password);
    if (!isPasswordValid) {
      throw new ApiError(401, 'بيانات الدخول غير صحيحة', ErrorCodes.INVALID_CREDENTIALS);
    }

    const isProfileComplete = this.isProfileComplete(user);
    const activeAcademicYear =
      (await AcademicYearService.getActive())?.academicYear ?? null;
    const enhancedUser = await this.getEnhancedUserData(user);

    try {
      if (user.userType === UserType.TEACHER) {
        await QrService.ensureTeacherQr(user.id);
      }
    } catch (err) {
      logger.warn({ err }, 'auto-ensure teacher QR on login failed');
    }

    const now = new Date();
    let expiresAt: Date;
    let expiresInSeconds: number;
    if (user.userType === UserType.TEACHER) {
      ({ expiresAt, expiresInSeconds } = AuthService.teacherTokenExpiry(now));
    } else {
      // Student: very long TTL by default (env-configurable).
      const days = parseInt(process.env['STUDENT_TOKEN_TTL_DAYS'] || '36500', 10);
      expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      expiresInSeconds = days * 24 * 60 * 60;
    }

    const token = await this.generateToken(user, expiresInSeconds);
    await TokenModel.create(user.id, token, expiresAt, data.oneSignalPlayerId);

    return {
      user: { ...enhancedUser, studyYear: activeAcademicYear?.year },
      token,
      isProfileComplete,
      requiresProfileCompletion: !isProfileComplete,
      activeAcademicYear,
    };
  }

  // Logout — throws if the token row can't be found (already expired / fake).
  static async logout(token: string): Promise<void> {
    const deleted = await TokenModel.deleteByToken(token);
    if (!deleted) {
      throw new ApiError(
        401,
        'التوكن غير موجود أو منتهي الصلاحية',
        ErrorCodes.TOKEN_INVALID
      );
    }
  }

  /**
   * Verify email for teacher or student. Throws `ApiError` with a stable
   * machine-readable code on every failure:
   *   - `LOCKED`        → 429 (too many wrong attempts)
   *   - `CODE_EXPIRED`  → 400
   *   - `INVALID_CODE`  → 400 (generic; covers not-found / no-code / wrong)
   *
   * The generic INVALID_CODE response prevents account enumeration.
   */
  static async verifyEmail(email: string, code: string): Promise<void> {
    const result = await UserModel.verifyEmail(email, code);

    if (!result.ok) {
      if (result.reason === 'locked') {
        throw new ApiError(
          429,
          'تم تجاوز عدد المحاولات المسموح. يرجى طلب رمز جديد',
          ErrorCodes.CODE_LOCKED
        );
      }
      if (result.reason === 'expired') {
        throw new ApiError(
          400,
          'انتهت صلاحية الرمز. يرجى طلب رمز جديد',
          ErrorCodes.CODE_EXPIRED
        );
      }
      throw new ApiError(400, 'رمز التحقق غير صحيح', ErrorCodes.INVALID_CODE);
    }

    // Best-effort: ensure teacher QR exists now that the account is active.
    try {
      const u = await UserModel.findByEmail(email);
      if (u && u.userType === UserType.TEACHER) {
        await QrService.ensureTeacherQr(u.id);
      }
    } catch (err) {
      logger.warn({ err }, 'auto-ensure teacher QR on verifyEmail failed');
    }
  }

  /**
   * Issue a fresh verification OTP and email it. The model returns the
   * plaintext code so we can send it; the database keeps only the hash.
   */
  static async resendVerificationCode(email: string): Promise<void> {
    const plaintextCode = await UserModel.resendVerificationCode(email);
    if (!plaintextCode) {
      throw new ApiError(
        400,
        'البريد الإلكتروني غير محقق',
        ErrorCodes.EMAIL_NOT_VERIFIED
      );
    }
    const updatedUser = await UserModel.findByEmail(email);
    if (updatedUser) {
      await sendVerificationEmail(email, plaintextCode, updatedUser.name);
    }
  }

  static async requestPasswordReset(email: string): Promise<void> {
    const resetCode = await UserModel.setPasswordResetCode(email);
    if (!resetCode) {
      throw new ApiError(404, 'المستخدم غير موجود', ErrorCodes.NOT_FOUND);
    }
    const user = await UserModel.findByEmail(email);
    if (user) {
      const emailSent = await sendPasswordResetEmail(email, resetCode, user.name);
      if (!emailSent) {
        throw new ApiError(
          502,
          'فشل في إرسال البريد الإلكتروني',
          ErrorCodes.EMAIL_SEND_FAILED
        );
      }
    }
  }

  /**
   * Reset password using the OTP delivered by requestPasswordReset. Same
   * discriminated handling as verifyEmail (LOCKED / CODE_EXPIRED / INVALID_CODE).
   */
  static async resetPassword(
    email: string,
    code: string,
    newPassword: string
  ): Promise<void> {
    const result = await UserModel.resetPassword(email, code, newPassword);
    if (!result.ok) {
      if (result.reason === 'locked') {
        throw new ApiError(
          429,
          'تم تجاوز عدد المحاولات المسموح. يرجى طلب رمز جديد',
          ErrorCodes.CODE_LOCKED
        );
      }
      if (result.reason === 'expired') {
        throw new ApiError(
          400,
          'انتهت صلاحية الرمز. يرجى طلب رمز جديد',
          ErrorCodes.CODE_EXPIRED
        );
      }
      throw new ApiError(
        400,
        'رمز إعادة التعيين غير صحيح',
        ErrorCodes.INVALID_CODE
      );
    }
  }

  /**
   * Shared session-build path for OAuth flows (Google + Apple). Handles the
   * active-academic-year lookup, enhanced user payload, token TTL policy
   * (students: multi-year; teachers: TEACHER_TOKEN_TTL_DAYS; others: 7 days),
   * JWT signing, and persistence of the token row with the OneSignal player id.
   */
  private static async buildOAuthSession(
    user: User,
    oneSignalPlayerId: string | undefined,
    isNewUser: boolean
  ): Promise<OAuthResult> {
    const activeAcademicYear =
      (await AcademicYearService.getActive())?.academicYear ?? null;
    const enhancedUser = await this.getEnhancedUserData(user);
    const isProfileComplete = isNewUser
      ? false
      : this.isProfileComplete(user);

    const jwtSecret = process.env['JWT_SECRET'] || 'fallback-secret';
    if (!process.env['JWT_SECRET']) {
      logger.warn('Missing JWT_SECRET in environment; using fallback');
    }

    let expiresAt: Date;
    let signOptions: jwt.SignOptions;
    if (user.userType === UserType.STUDENT) {
      const days = parseInt(
        process.env['STUDENT_TOKEN_TTL_DAYS'] || '36500',
        10
      );
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      signOptions = { expiresIn: `${days}d` } as jwt.SignOptions;
    } else if (user.userType === UserType.TEACHER) {
      const days = AuthService.teacherTokenTtlDays();
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      signOptions = { expiresIn: `${days}d` } as jwt.SignOptions;
    } else {
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      signOptions = { expiresIn: '7d' } as jwt.SignOptions;
    }

    const token = jwt.sign(
      {
        userId: user.id,
        userType: user.userType,
        email: user.email,
      },
      jwtSecret,
      signOptions
    );

    await TokenModel.create(user.id, token, expiresAt, oneSignalPlayerId);

    return {
      user: { ...enhancedUser, studyYear: activeAcademicYear?.year },
      token,
      isNewUser,
      isProfileComplete,
      requiresProfileCompletion: !isProfileComplete,
      activeAcademicYear,
    };
  }

  // Generate JWT token (without saving to DB)
  private static async generateToken(
    user: User,
    expiresInSeconds: number
  ): Promise<string> {
    const payload = {
      userId: user.id,
      email: user.email,
      userType: user.userType,
    };

    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      throw new Error('مفتاح JWT غير مُعد');
    }

    const token = jwt.sign(payload, secret, {
      expiresIn: expiresInSeconds,
    } as jwt.SignOptions);
    return token;
  }

  // Check if user profile is complete
  private static isProfileComplete(user: User): boolean {
    if (user.userType === UserType.TEACHER) {
      // Check required teacher fields
      return !!(
        user.phone &&
        user.phone.trim() !== '' &&
        user.address &&
        user.address.trim() !== '' &&
        user.bio &&
        user.bio.trim() !== '' &&
        user.experienceYears !== null &&
        user.experienceYears !== undefined
      );
    } else if (user.userType === UserType.STUDENT) {
      // Check required student fields
      return !!(
        user.studentPhone &&
        user.studentPhone.trim() !== '' &&
        user.parentPhone &&
        user.parentPhone.trim() !== '' &&
        user.schoolName &&
        user.schoolName.trim() !== ''
      );
    }
    return false;
  }

  /**
   * Google OAuth: log in or create a user from verified Google profile data.
   * Mirrors appleAuth but also supports a `referralCode` for new teachers.
   */
  static async googleAuth(
    googleData: any,
    userType: 'teacher' | 'student'
  ): Promise<OAuthResult> {
    const { email, name, sub } = googleData;
    const existingUser = await UserModel.findByEmail(email);

    if (existingUser) {
      if (existingUser.authProvider !== 'google') {
        throw new ApiError(
          409,
          'قمت بانشاء الحساب باستخدام البريد وكلمة المرور الرجاء تسجيل الدخول بنفس الطريقة',
          ErrorCodes.PROVIDER_MISMATCH
        );
      }
      // For an existing user, the stored userType is the source of truth.
      // We intentionally ignore the client-supplied userType so the same
      // /auth/google-auth endpoint can serve as "login" for either role
      // without the client needing to know the user's type in advance
      // (the Flutter app hard-codes 'student' on its login button).
      // Account *creation* still honours the supplied userType below — that
      // path is reached only when no user exists yet.

      try {
        if (existingUser.userType === UserType.TEACHER) {
          await QrService.ensureTeacherQr(existingUser.id);
        }
      } catch (err) {
        logger.warn({ err }, 'auto-ensure teacher QR on google login failed');
      }

      return this.buildOAuthSession(
        existingUser,
        googleData.oneSignalPlayerId,
        false
      );
    }

    // No matching user. Phase 8 — before creating ANY new user (student or
    // otherwise) for this email, check whether a teacher_application is on
    // file. If so, refuse with a status-aware message instead of silently
    // creating a student account for an in-progress teacher application.
    await this.assertNoBlockingApplication(email);

    // Teacher provisioning via Google is closed (Phase 1 onboarding policy):
    // teachers must come through the application flow at
    // POST /api/teacher-applications.
    if (userType === 'teacher') {
      throw new ApiError(
        403,
        'يرجى تقديم طلب الانضمام كأستاذ أولاً، وبعد الموافقة يمكنك تسجيل الدخول.',
        ErrorCodes.BUSINESS_RULE
      );
    }

    // Student provisioning. Password is throwaway — auth runs through Google.
    const tempPassword = `google_${sub}_${Date.now()}`;
    const hashedPassword = await bcrypt.hash(tempPassword, 12);
    const { user: newUser } = await UserModel.create({
      name,
      email,
      password: hashedPassword,
      userType: UserType.STUDENT,
      status: UserStatus.ACTIVE,
      authProvider: 'google',
      oauthProviderId: sub,
      studentPhone: '',
      parentPhone: '',
      schoolName: '',
    });

    return this.buildOAuthSession(newUser, googleData.oneSignalPlayerId, true);
  }

  /**
   * Complete an OAuth-bootstrapped user's profile (role-aware). Throws if
   * the user is missing or the role is unsupported; otherwise returns the
   * enhanced user shape plus profile-completeness flags.
   */
  static async completeProfile(
    userId: string,
    userType: string,
    profileData: any
  ): Promise<{
    user: any;
    isProfileComplete: boolean;
    requiresProfileCompletion: boolean;
    locationDetails: unknown;
  }> {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new ApiError(404, 'المستخدم غير موجود', ErrorCodes.NOT_FOUND);
    }
    if (userType !== 'teacher' && userType !== 'student') {
      throw new ApiError(
        400,
        'نوع المستخدم غير صحيح',
        ErrorCodes.USER_TYPE_MISMATCH
      );
    }

    const {
      latitude,
      longitude,
      address,
      formattedAddress,
      country,
      city,
      state,
      zipcode,
      streetName,
      suburb,
      locationConfidence,
    } = profileData;

    let locationDetails: any = null;
    if (latitude && longitude) {
      try {
        const geocodingService = new GeocodingService();
        locationDetails = await geocodingService.getLocationDetails(
          latitude,
          longitude
        );
      } catch (err) {
        logger.warn({ err }, 'geocoding failed during completeProfile');
      }
    }

    const updateData: any = {
      latitude: Number(latitude),
      longitude: Number(longitude),
    };

    if (locationDetails) {
      updateData.formatted_address = locationDetails.formattedAddress;
      updateData.country = locationDetails.country;
      updateData.city = locationDetails.city;
      updateData.state = locationDetails.state;
      updateData.zipcode = locationDetails.zipcode;
      updateData.street_name = locationDetails.streetName;
      updateData.suburb = locationDetails.suburb;
      updateData.location_confidence = locationDetails.confidence;
      updateData.address = address || locationDetails.formattedAddress;
    } else {
      if (formattedAddress) updateData.formatted_address = formattedAddress;
      if (country) updateData.country = country;
      if (city) updateData.city = city;
      if (state) updateData.state = state;
      if (zipcode) updateData.zipcode = zipcode;
      if (streetName) updateData.street_name = streetName;
      if (suburb) updateData.suburb = suburb;
      if (locationConfidence !== undefined)
        updateData.location_confidence = Number(locationConfidence);
      if (address) updateData.address = address;
    }

    // Best-effort: persist a new avatar if one was supplied as base64.
    try {
      const profileImageBase64 = profileData?.profileImageBase64 as
        | string
        | undefined;
      if (
        profileImageBase64 &&
        profileImageBase64.startsWith('data:image/')
      ) {
        try {
          const existing = await UserModel.findById(userId);
          const oldPath =
            (existing as any)?.profileImagePath ||
            (existing as any)?.profile_image_path;
          if (oldPath) await ImageService.deleteUserAvatar(oldPath);
        } catch (err) {
          logger.warn({ err }, 'could not delete old user avatar');
        }
        const savedPath = await ImageService.saveUserAvatar(
          profileImageBase64,
          `avatar_${user.id}`
        );
        updateData.profile_image_path = savedPath;
      }
    } catch (err) {
      logger.warn({ err }, 'failed to process profile avatar (completeProfile)');
    }

    if (userType === 'teacher') {
      const {
        name,
        phone,
        address: tAddress,
        bio,
        experienceYears,
        gradeIds,
        studyYear,
        gender,
        birthDate,
      } = profileData;

      if (name) updateData.name = name;
      if (phone) updateData.phone = phone;
      if (tAddress) updateData.address = tAddress;
      if (bio) updateData.bio = bio;
      if (experienceYears !== undefined && experienceYears !== null) {
        const exp = Number(experienceYears);
        if (!Number.isNaN(exp)) updateData.experience_years = exp;
      }
      if (gender) updateData.gender = gender;
      if (birthDate) updateData.birth_date = birthDate;

      const updatedUser = await UserModel.update(userId, updateData);

      if (Array.isArray(gradeIds) && gradeIds.length > 0 && studyYear) {
        try {
          await TeacherGradeModel.createMany(userId, gradeIds, studyYear);
        } catch (err) {
          logger.warn({ err }, 'failed to create teacher grade relationships (completeProfile)');
        }
      }

      const isProfileComplete = updatedUser
        ? this.isProfileComplete(updatedUser)
        : false;
      const enhancedUser = updatedUser
        ? await this.getEnhancedUserData(updatedUser)
        : null;

      return {
        user: enhancedUser,
        isProfileComplete,
        requiresProfileCompletion: !isProfileComplete,
        locationDetails,
      };
    }

    // Student branch.
    const {
      name,
      gradeId,
      studyYear,
      studentPhone,
      parentPhone,
      schoolName,
      gender,
      birthDate,
    } = profileData;

    if (name) updateData.name = name;
    if (studentPhone) updateData.student_phone = studentPhone;
    if (parentPhone) updateData.parent_phone = parentPhone;
    if (schoolName) updateData.school_name = schoolName;
    if (gender) updateData.gender = gender;
    if (birthDate) updateData.birth_date = birthDate;

    const updatedUser = await UserModel.update(userId, updateData);

    await StudentGradeModel.create({
      studentId: userId,
      gradeId,
      studyYear,
    });

    const isProfileComplete = updatedUser
      ? this.isProfileComplete(updatedUser)
      : false;
    const enhancedUser = updatedUser
      ? await this.getEnhancedUserData(updatedUser)
      : null;

    return {
      user: enhancedUser,
      isProfileComplete,
      requiresProfileCompletion: !isProfileComplete,
      locationDetails,
    };
  }

  // Sanitize user data (remove sensitive information)
  private static sanitizeUser(user: User): Partial<User> {
    const { password, ...sanitizedUser } = user;
    return sanitizedUser;
  }

  // Get enhanced user data with additional information
  private static async getEnhancedUserData(user: User): Promise<any> {
    const sanitizedUser = this.sanitizeUser(user);

    // If user is a teacher, add teacher-specific data
    if (user.userType === 'teacher') {
      try {
        // Get teacher grades
        const teacherGrades = await TeacherGradeModel.findByTeacherId(user.id);

        // Get grade details for each teacher grade
        const gradesWithDetails = await Promise.all(
          teacherGrades.map(async teacherGrade => {
            const grade = await GradeModel.findById(teacherGrade.gradeId);
            return {
              id: teacherGrade.id,
              gradeId: teacherGrade.gradeId,
              gradeName: grade?.name || 'Unknown Grade',
              studyYear: teacherGrade.studyYear,
              createdAt: teacherGrade.createdAt,
            };
          })
        );

        // Ensure and include QR info
        let qr: string | null = null;
        try {
          const qrInfo = await QrService.ensureTeacherQr(user.id);
          qr = qrInfo.publicUrl;
        } catch (e) {
          console.error('Error ensuring teacher QR (enhanced):', e);
        }

        return {
          ...sanitizedUser,
          teacherGrades: gradesWithDetails,
          qr,
          // Include location data if available
          location: {
            latitude: user.latitude,
            longitude: user.longitude,
            address: user.address,
            formattedAddress: user.formattedAddress,
            country: user.country,
            city: user.city,
            state: user.state,
            zipcode: user.zipcode,
            streetName: user.streetName,
            suburb: user.suburb,
            locationConfidence: user.locationConfidence,
          },
        };
      } catch (error) {
        console.error('Error getting enhanced teacher data:', error);
        // Return basic user data if there's an error
        return {
          ...sanitizedUser,
          teacherGrades: [],
          location: {
            latitude: user.latitude,
            longitude: user.longitude,
            address: user.address,
            formattedAddress: user.formattedAddress,
            country: user.country,
            city: user.city,
            state: user.state,
            zipcode: user.zipcode,
            streetName: user.streetName,
            suburb: user.suburb,
            locationConfidence: user.locationConfidence,
          },
        };
      }
    }

    // If user is a student, add student-specific data (current study year grades)
    if (user.userType === 'student') {
      try {
        // Get active academic year
        const activeAcademicYear =
          (await AcademicYearService.getActive())?.academicYear ?? null;

        // Fetch student grades
        const studentGrades = await StudentGradeModel.findByStudentId(user.id);
        const filteredGrades = activeAcademicYear
          ? studentGrades.filter(sg => sg.studyYear === activeAcademicYear.year)
          : studentGrades;

        // Include grade details
        const gradesWithDetails = await Promise.all(
          filteredGrades.map(async sg => {
            const grade = await GradeModel.findById(sg.gradeId);
            return {
              id: sg.id,
              gradeId: sg.gradeId,
              gradeName: grade?.name || 'Unknown Grade',
              studyYear: sg.studyYear,
              createdAt: sg.createdAt,
            };
          })
        );

        return {
          ...sanitizedUser,
          studentGrades: gradesWithDetails,
          location: {
            latitude: (user as any).latitude,
            longitude: (user as any).longitude,
            address: (user as any).address,
            formattedAddress: (user as any).formattedAddress,
            country: (user as any).country,
            city: (user as any).city,
            state: (user as any).state,
            zipcode: (user as any).zipcode,
            streetName: (user as any).streetName,
            suburb: (user as any).suburb,
            locationConfidence: (user as any).locationConfidence,
          },
        };
      } catch (error) {
        console.error('Error getting enhanced student data:', error);
        return {
          ...sanitizedUser,
          studentGrades: [],
          location: {
            latitude: (user as any).latitude,
            longitude: (user as any).longitude,
            address: (user as any).address,
            formattedAddress: (user as any).formattedAddress,
            country: (user as any).country,
            city: (user as any).city,
            state: (user as any).state,
            zipcode: (user as any).zipcode,
            streetName: (user as any).streetName,
            suburb: (user as any).suburb,
            locationConfidence: (user as any).locationConfidence,
          },
        };
      }
    }

    // For others, return basic data with location
    return {
      ...sanitizedUser,
      location: {
        latitude: (user as any).latitude,
        longitude: (user as any).longitude,
        address: (user as any).address,
        formattedAddress: (user as any).formattedAddress,
        country: (user as any).country,
        city: (user as any).city,
        state: (user as any).state,
        zipcode: (user as any).zipcode,
        streetName: (user as any).streetName,
        suburb: (user as any).suburb,
        locationConfidence: (user as any).locationConfidence,
      },
    };
  }

  /**
   * Update a role-restricted subset of a user's profile. Accepts both
   * camelCase and snake_case keys from the client and normalises to the
   * snake_case shape expected by the model. Geocoding fills any missing
   * address fields when lat/lng are provided alone.
   */
  static async updateProfile(
    userId: string,
    userType: string,
    profileData: any
  ): Promise<{ user: any }> {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new ApiError(404, 'المستخدم غير موجود', ErrorCodes.NOT_FOUND);
    }

    // ── Academic stage (grade) change — students only ──────────────────────────
    // Rule: a student may change their academic stage ONLY when they have no
    // active in-person (physical) enrollment. `course_bookings` ARE the physical
    // courses — video courses live in a separate library and are NOT affected by
    // stage (nor are invoices, past orders, or access rights). Active = confirmed
    // | approved. This server-side guard is authoritative; the mobile UI also
    // gates the field, but UI gating alone is insufficient.
    //
    // The grade write also happens here because `gradeId` is intentionally kept
    // out of the field allow-list below — only this validated path may change it.
    if (
      userType === 'student' &&
      profileData.gradeId !== undefined &&
      profileData.gradeId !== null &&
      String(profileData.gradeId).length > 0
    ) {
      const newGradeId = String(profileData.gradeId);
      const activeGrades = await StudentGradeModel.findActiveByStudentId(userId);
      const currentGradeId = activeGrades[0]?.gradeId;

      if (currentGradeId !== newGradeId) {
        const { rows } = await pool.query(
          `SELECT 1 FROM course_bookings
            WHERE student_id = $1
              AND status IN ('confirmed', 'approved')
              AND is_deleted = FALSE
            LIMIT 1`,
          [userId]
        );
        if (rows.length > 0) {
          throw new ApiError(
            409,
            'لا يمكن تغيير المرحلة الدراسية أثناء وجود دورة حضورية مفعّلة. يمكنك تغييرها بعد انتهاء الدورة.',
            ErrorCodes.BUSINESS_RULE
          );
        }

        // Allowed → deactivate the previous active grade(s) and record the new
        // one for the active study year. Best-effort: a failure here must not
        // wipe the rest of the profile update.
        const studyYear =
          (await AcademicYearService.getActive())?.academicYear?.year ??
          activeGrades[0]?.studyYear ??
          null;
        try {
          for (const g of activeGrades) {
            if (g.gradeId !== newGradeId) {
              await StudentGradeModel.update(g.id, { isActive: false });
            }
          }
          if (studyYear) {
            await StudentGradeModel.create({
              studentId: userId,
              gradeId: newGradeId,
              studyYear,
            });
          } else {
            logger.warn(
              { userId },
              'no active study year — skipped student grade change (updateProfile)'
            );
          }
        } catch (err) {
          logger.warn({ err }, 'failed to apply student grade change (updateProfile)');
        }
      }
    }

    let allowedFields: string[];
    if (userType === 'teacher') {
      allowedFields = [
        'name',
        'phone',
        'bio',
        'experience_years',
        'latitude',
        'longitude',
        'address',
        'formatted_address',
        'country',
        'city',
        'state',
        'zipcode',
        'street_name',
        'suburb',
        'location_confidence',
      ];
    } else if (userType === 'student') {
      allowedFields = [
        'name',
        'student_phone',
        'parent_phone',
        'school_name',
        'gender',
        'birth_date',
        'address',
        'latitude',
        'longitude',
        'formatted_address',
        'country',
        'city',
        'state',
        'zipcode',
        'street_name',
        'suburb',
        'location_confidence',
      ];
    } else {
      throw new ApiError(
        400,
        'نوع المستخدم غير مدعوم',
        ErrorCodes.USER_TYPE_MISMATCH
      );
    }

    const filteredData: Record<string, any> = {};
    for (const [key, value] of Object.entries(profileData)) {
      if (allowedFields.includes(key)) {
        filteredData[key] = value;
      }
    }

    const camelToSnakeMap: Record<string, string> = {
      formattedAddress: 'formatted_address',
      streetName: 'street_name',
      locationConfidence: 'location_confidence',
      birthDate: 'birth_date',
      parentPhone: 'parent_phone',
      studentPhone: 'student_phone',
      schoolName: 'school_name',
    };
    for (const [camel, snake] of Object.entries(camelToSnakeMap)) {
      if (profileData[camel] !== undefined && allowedFields.includes(snake)) {
        filteredData[snake] = profileData[camel];
      }
    }

    const hasLat =
      profileData.latitude !== undefined && profileData.latitude !== null;
    const hasLng =
      profileData.longitude !== undefined && profileData.longitude !== null;
    const hasAnyAddressField =
      profileData.formatted_address !== undefined ||
      profileData.formattedAddress !== undefined ||
      profileData.country !== undefined ||
      profileData.city !== undefined ||
      profileData.state !== undefined ||
      profileData.zipcode !== undefined ||
      profileData.street_name !== undefined ||
      profileData.streetName !== undefined ||
      profileData.suburb !== undefined ||
      profileData.location_confidence !== undefined ||
      profileData.locationConfidence !== undefined ||
      profileData.address !== undefined;

    if (hasLat && hasLng && !hasAnyAddressField) {
      try {
        const geocodingService = new GeocodingService();
        const latNum = Number(profileData.latitude);
        const lngNum = Number(profileData.longitude);
        const details = await geocodingService.getLocationDetails(
          latNum,
          lngNum
        );
        if (details) {
          filteredData['formatted_address'] = details.formattedAddress;
          filteredData['country'] = details.country;
          filteredData['city'] = details.city;
          filteredData['state'] = details.state;
          filteredData['zipcode'] = details.zipcode;
          filteredData['street_name'] = details.streetName;
          filteredData['suburb'] = details.suburb;
          filteredData['location_confidence'] = details.confidence;
          if (profileData.address !== undefined) {
            filteredData['address'] = profileData.address;
          } else if (details.formattedAddress) {
            filteredData['address'] = details.formattedAddress;
          }
        }
      } catch (err) {
        logger.warn({ err }, 'geocoding failed during updateProfile');
      }
    }

    // Best-effort: persist a new avatar if one was supplied as base64.
    try {
      const raw = profileData?.profileImageBase64 as string | undefined;
      if (raw) {
        // Some clients send base64 without the data: prefix; normalise.
        const base64 = raw.startsWith('data:image/')
          ? raw
          : `data:image/jpeg;base64,${raw}`;

        const oldPath =
          (user as any)?.profileImagePath ||
          (user as any)?.profile_image_path;
        if (oldPath) {
          try {
            await ImageService.deleteUserAvatar(oldPath);
          } catch (err) {
            logger.warn({ err }, 'failed to delete old avatar (updateProfile)');
          }
        }

        const savedPath = await ImageService.saveUserAvatar(
          base64,
          `avatar_${user.id}`
        );
        filteredData['profile_image_path'] = savedPath;
      }
    } catch (err) {
      logger.warn({ err }, 'failed to process profile avatar (updateProfile)');
    }

    const updatedUser = await UserModel.update(userId, filteredData);
    if (!updatedUser) {
      throw new ApiError(
        500,
        'فشل في تحديث بيانات المستخدم',
        ErrorCodes.INTERNAL_ERROR
      );
    }

    return { user: updatedUser };
  }
}
