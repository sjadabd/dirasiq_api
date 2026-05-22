// Teacher application — Phase 1 service.
//
// Responsibilities for this phase:
//   - create()         : ingest a public application submission with strict
//                        anti-duplicate checks (against users + open
//                        applications) and a 30-day rejection cooldown.
//   - listForAdmin()   : super-admin paginated browse with status filter
//                        and free-text search across name / email / phone.
//   - getByIdForAdmin(): single application detail for super-admin.
//
// Phase 2 will add approve / reject / request-more-info actions.
// Phase 3 will add the secure file upload pipeline.

import crypto from 'crypto';

import bcrypt from 'bcryptjs';

import pool from '../config/database';
import { UserModel } from '../models/user.model';
import {
  type TeacherApplication,
  TeacherApplicationStatus,
} from '../types';
import { ApiError, ErrorCodes } from '../utils/api-error';
import { logger } from '../utils/logger';
import { signUploadToken } from '../utils/upload-token';
import { GoogleAuthService } from './google-auth.service';
import { QrService } from './qr.service';
import { TeacherApplicationNotifyService } from './teacher-application-notify.service';
import { applicationEmailVerificationCodeEmail } from './teacher-application-emails';
import transporter from '../config/email';
import type {
  TeacherApplicationCreateInput,
  TeacherApplicationApproveInput,
  TeacherApplicationRejectInput,
  TeacherApplicationNeedsMoreInfoInput,
} from '../schemas/teacher-application.schemas';

// Tiny helper — fire a notify hook without awaiting (post-COMMIT), with a
// catch that logs but never re-throws. Keeps the service layer free of
// ad-hoc try/wraps at every call site.
function fireNotify(p: Promise<void>, context: Record<string, unknown>): void {
  p.catch((err) => {
    logger.warn({ err, ...context }, 'teacher-application notify hook crashed');
  });
}

const BCRYPT_ROUNDS = Number(process.env['BCRYPT_ROUNDS'] || 12);
const REJECTION_COOLDOWN_DAYS = 30;

// Phase 8 — email-verification OTP settings.
const EMAIL_OTP_EXPIRY_MINUTES = Number(process.env['EMAIL_OTP_EXPIRY_MINUTES'] || 10);
const EMAIL_OTP_MAX_ATTEMPTS = Number(process.env['EMAIL_OTP_MAX_ATTEMPTS'] || 5);

const FROM_ADDRESS =
  process.env['EMAIL_FROM'] ||
  process.env['EMAIL_USER'] ||
  'mulhim@lamassu-iq.com';

function generateOtp(): string {
  // 6-digit, cryptographically random, zero-padded.
  return (crypto.randomInt(0, 1_000_000)).toString().padStart(6, '0');
}

async function sendVerificationCodeEmail(args: {
  to: string;
  fullName: string;
  code: string;
}): Promise<void> {
  const mail = applicationEmailVerificationCodeEmail({
    fullName: args.fullName,
    code: args.code,
    expiresInMinutes: EMAIL_OTP_EXPIRY_MINUTES,
  });
  await transporter.sendMail({
    from: FROM_ADDRESS,
    to: args.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
}

// SELECT list used by both list and detail endpoints. We never return
// password_hash to clients — even to super-admin — there is no UI reason for
// it and excluding it removes any chance of accidental leak through logs.
const APPLICATION_PUBLIC_COLUMNS = `
  id,
  first_name        AS "firstName",
  last_name         AS "lastName",
  full_name         AS "fullName",
  phone,
  email,
  gender,
  birth_date        AS "birthDate",
  city,
  area,
  subject,
  teaching_stage    AS "teachingStage",
  years_of_experience    AS "yearsOfExperience",
  current_workplace      AS "currentWorkplace",
  has_physical_courses   AS "hasPhysicalCourses",
  estimated_student_count AS "estimatedStudentCount",
  bio,
  facebook_url      AS "facebookUrl",
  instagram_url     AS "instagramUrl",
  telegram_url      AS "telegramUrl",
  tiktok_url        AS "tiktokUrl",
  youtube_url       AS "youtubeUrl",
  profile_image     AS "profileImage",
  certificate_image AS "certificateImage",
  national_id_image AS "nationalIdImage",
  optional_attachment AS "optionalAttachment",
  intro_video_url   AS "introVideoUrl",
  application_status AS "applicationStatus",
  rejection_reason  AS "rejectionReason",
  admin_notes       AS "adminNotes",
  approved_by       AS "approvedBy",
  approved_at       AS "approvedAt",
  rejected_at       AS "rejectedAt",
  needs_more_info_at AS "needsMoreInfoAt",
  created_at        AS "createdAt",
  updated_at        AS "updatedAt",
  deleted_at        AS "deletedAt"
`;

// Lightweight row shape returned by list — drops the heavier audit / bio /
// social fields to keep payload size reasonable. Detail returns the full row.
const APPLICATION_LIST_COLUMNS = `
  id,
  first_name        AS "firstName",
  last_name         AS "lastName",
  full_name         AS "fullName",
  phone,
  email,
  subject,
  teaching_stage    AS "teachingStage",
  years_of_experience AS "yearsOfExperience",
  city,
  area,
  application_status AS "applicationStatus",
  created_at        AS "createdAt",
  approved_at       AS "approvedAt",
  rejected_at       AS "rejectedAt"
`;

type AdminListRow = Pick<
  TeacherApplication,
  | 'id'
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'phone'
  | 'email'
  | 'subject'
  | 'teachingStage'
  | 'yearsOfExperience'
  | 'city'
  | 'area'
  | 'applicationStatus'
  | 'createdAt'
  | 'approvedAt'
  | 'rejectedAt'
>;

export class TeacherApplicationService {
  /**
   * Public submission. Two paths depending on input.authProvider:
   *
   *   email  → email + password + 6-digit OTP that the applicant has to
   *            confirm via verifyEmail() before the row counts as a
   *            real pending application (super-admin notification + appearance
   *            in the inbox is deferred until verification).
   *   google → googleToken provides a verified email — no OTP needed.
   *            email_verified_at is stamped immediately and the application
   *            is queued + super-admins notified right away.
   *
   * Returns a Phase 3 upload token in both cases so the Flutter client can
   * attach files without waiting for verification.
   */
  static async create(
    input: TeacherApplicationCreateInput
  ): Promise<{
    id: string;
    applicationStatus: TeacherApplicationStatus;
    uploadToken: string;
    uploadTokenExpiresInSeconds: number;
    emailVerificationRequired: boolean;
    authProvider: 'email' | 'google';
  }> {
    // 1. Resolve email + auth-method side-data.
    let email: string;
    let passwordHash: string | null = null;
    let oauthProviderId: string | null = null;
    let emailAlreadyVerified = false;

    if (input.authProvider === 'google') {
      // Verify the Google idToken server-side — never trust client claims.
      const verified = await GoogleAuthService.verifyGoogleToken(input.googleToken!);
      if (!verified?.email || !verified?.sub) {
        throw new ApiError(400, 'بيانات Google ناقصة', ErrorCodes.INVALID_REQUEST);
      }
      email = String(verified.email).toLowerCase();
      oauthProviderId = String(verified.sub);
      emailAlreadyVerified = true;
    } else {
      // Email + password path. Zod's superRefine guarantees both are present.
      email = input.email!;
      passwordHash = await bcrypt.hash(input.password!, BCRYPT_ROUNDS);
    }

    const phone = input.phone;

    // 2. Block if a real users row already exists.
    const existingUser = await UserModel.findByEmail(email);
    if (existingUser) {
      throw new ApiError(
        409,
        'هذا البريد الإلكتروني مرتبط بحساب موجود مسبقاً',
        ErrorCodes.EMAIL_ALREADY_EXISTS
      );
    }

    // 3. Block if an active application already exists for that email or
    //    phone, and enforce the 30-day rejection cooldown.
    const { rows: existingApps } = await pool.query<{
      id: string;
      application_status: TeacherApplicationStatus;
      rejected_at: string | null;
      email_match: boolean;
      phone_match: boolean;
    }>(
      `SELECT id,
              application_status,
              rejected_at,
              (email = $1) AS email_match,
              (phone = $2) AS phone_match
         FROM teacher_applications
        WHERE (email = $1 OR phone = $2)
          AND deleted_at IS NULL
        ORDER BY created_at DESC`,
      [email, phone]
    );

    for (const row of existingApps) {
      if (
        row.application_status === TeacherApplicationStatus.PENDING ||
        row.application_status === TeacherApplicationStatus.APPROVED ||
        row.application_status === TeacherApplicationStatus.NEEDS_MORE_INFO
      ) {
        const field = row.email_match ? 'email' : 'phone';
        throw new ApiError(
          409,
          row.email_match
            ? 'يوجد طلب انضمام نشط بنفس البريد الإلكتروني'
            : 'يوجد طلب انضمام نشط بنفس رقم الهاتف',
          ErrorCodes.ALREADY_EXISTS,
          { field }
        );
      }
      if (
        row.application_status === TeacherApplicationStatus.REJECTED &&
        row.rejected_at
      ) {
        const rejectedAt = new Date(row.rejected_at);
        const ageDays = (Date.now() - rejectedAt.getTime()) / 86_400_000;
        if (ageDays < REJECTION_COOLDOWN_DAYS) {
          const waitDays = Math.ceil(REJECTION_COOLDOWN_DAYS - ageDays);
          throw new ApiError(
            429,
            `لا يمكنك إعادة التقديم قبل مرور ${waitDays} يوماً من تاريخ الرفض`,
            ErrorCodes.BUSINESS_RULE,
            { waitDays }
          );
        }
      }
    }

    const fullName = `${input.firstName} ${input.lastName}`.trim();

    // 4. Prepare email-verification OTP (only for the email auth path).
    let otpHash: string | null = null;
    let otpExpiresAt: Date | null = null;
    let plaintextOtp: string | null = null;
    if (input.authProvider === 'email') {
      plaintextOtp = generateOtp();
      otpHash = await bcrypt.hash(plaintextOtp, BCRYPT_ROUNDS);
      otpExpiresAt = new Date(Date.now() + EMAIL_OTP_EXPIRY_MINUTES * 60_000);
    }

    // 5. Insert.
    try {
      const { rows } = await pool.query<{
        id: string;
        application_status: TeacherApplicationStatus;
      }>(
        `INSERT INTO teacher_applications (
           first_name, last_name, full_name,
           phone, email, password_hash,
           gender, birth_date, city, area,
           subject, teaching_stage, custom_teaching_stage,
           years_of_experience, current_workplace,
           has_physical_courses, estimated_student_count,
           bio,
           facebook_url, instagram_url, telegram_url, tiktok_url, youtube_url,
           onesignal_player_id,
           application_auth_provider, oauth_provider_id,
           email_verified_at,
           email_verification_code_hash, email_verification_expires_at
         ) VALUES (
           $1,$2,$3,
           $4,$5,$6,
           $7,$8,$9,$10,
           $11,$12,$13,
           $14,$15,
           $16,$17,
           $18,
           $19,$20,$21,$22,$23,
           $24,
           $25,$26,
           $27,
           $28,$29
         )
         RETURNING id, application_status`,
        [
          input.firstName,
          input.lastName,
          fullName,
          phone,
          email,
          passwordHash,
          input.gender,
          input.birthDate,
          input.city,
          input.area,
          input.subject,
          input.teachingStage,
          input.customTeachingStage ?? null,
          input.yearsOfExperience,
          input.currentWorkplace ?? null,
          input.hasPhysicalCourses,
          input.estimatedStudentCount,
          input.bio ?? null,
          input.facebookUrl ?? null,
          input.instagramUrl ?? null,
          input.telegramUrl ?? null,
          input.tiktokUrl ?? null,
          input.youtubeUrl ?? null,
          input.oneSignalPlayerId ?? null,
          input.authProvider,
          oauthProviderId,
          emailAlreadyVerified ? new Date() : null,
          otpHash,
          otpExpiresAt,
        ]
      );

      const created = rows[0]!;
      const tokenInfo = signUploadToken(created.id);
      logger.info(
        {
          applicationId: created.id,
          authProvider: input.authProvider,
          requiresVerification: !emailAlreadyVerified,
        },
        'teacher application created'
      );

      if (emailAlreadyVerified) {
        // Google submissions are immediately "received" — notify applicant
        // and super-admins. Fire-and-forget.
        fireNotify(
          TeacherApplicationNotifyService.onSubmitted({
            applicationId: created.id,
            email,
            fullName,
            subject: input.subject,
            oneSignalPlayerId: input.oneSignalPlayerId ?? null,
          }),
          { applicationId: created.id, hook: 'onSubmitted' }
        );
      } else if (plaintextOtp) {
        // Email submissions — send the OTP only. The full "received"
        // notification fires after verifyEmail() succeeds.
        fireNotify(
          sendVerificationCodeEmail({ to: email, fullName, code: plaintextOtp }),
          { applicationId: created.id, hook: 'sendVerificationCodeEmail' }
        );
      }

      return {
        id: created.id,
        applicationStatus: created.application_status,
        uploadToken: tokenInfo.token,
        uploadTokenExpiresInSeconds: tokenInfo.expiresInSeconds,
        emailVerificationRequired: !emailAlreadyVerified,
        authProvider: input.authProvider,
      };
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === '23505'
      ) {
        throw new ApiError(
          409,
          'يوجد طلب انضمام نشط بنفس البيانات',
          ErrorCodes.ALREADY_EXISTS
        );
      }
      throw err;
    }
  }

  /**
   * Verify the OTP for an email-provider application. On first success,
   * fires the full onSubmitted notification (applicant ack + super-admin
   * alert). Idempotent — verifying an already-verified application is a
   * no-op success.
   */
  static async verifyEmail(
    applicationId: string,
    code: string
  ): Promise<{ verified: true; alreadyVerified: boolean }> {
    const { rows } = await pool.query<{
      id: string;
      email: string;
      full_name: string;
      subject: string;
      application_auth_provider: string;
      application_status: TeacherApplicationStatus;
      email_verified_at: string | null;
      email_verification_code_hash: string | null;
      email_verification_expires_at: string | null;
      email_verification_attempts: number;
      onesignal_player_id: string | null;
    }>(
      `SELECT id, email, full_name, subject,
              application_auth_provider, application_status,
              email_verified_at, email_verification_code_hash,
              email_verification_expires_at, email_verification_attempts,
              onesignal_player_id
         FROM teacher_applications
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1`,
      [applicationId]
    );
    const row = rows[0];
    if (!row) {
      throw new ApiError(404, 'طلب الانضمام غير موجود', ErrorCodes.NOT_FOUND);
    }
    if (row.application_auth_provider !== 'email') {
      throw new ApiError(
        400,
        'هذا الطلب لا يحتاج تحقق بريد إلكتروني',
        ErrorCodes.BUSINESS_RULE
      );
    }
    if (row.email_verified_at) {
      return { verified: true, alreadyVerified: true };
    }
    if (row.email_verification_attempts >= EMAIL_OTP_MAX_ATTEMPTS) {
      throw new ApiError(
        429,
        'تجاوزت عدد المحاولات المسموح بها — يرجى طلب رمز جديد',
        ErrorCodes.CODE_LOCKED
      );
    }
    if (!row.email_verification_code_hash || !row.email_verification_expires_at) {
      throw new ApiError(
        400,
        'لا يوجد رمز تحقق فعّال — يرجى طلب رمز جديد',
        ErrorCodes.INVALID_CODE
      );
    }
    if (new Date(row.email_verification_expires_at).getTime() < Date.now()) {
      throw new ApiError(
        400,
        'انتهت صلاحية رمز التحقق — يرجى طلب رمز جديد',
        ErrorCodes.CODE_EXPIRED
      );
    }

    const ok = await bcrypt.compare(code, row.email_verification_code_hash);
    if (!ok) {
      await pool.query(
        `UPDATE teacher_applications
            SET email_verification_attempts = email_verification_attempts + 1
          WHERE id = $1`,
        [applicationId]
      );
      throw new ApiError(400, 'رمز التحقق غير صحيح', ErrorCodes.INVALID_CODE);
    }

    await pool.query(
      `UPDATE teacher_applications
          SET email_verified_at             = NOW(),
              email_verification_code_hash  = NULL,
              email_verification_expires_at = NULL,
              email_verification_attempts   = 0
        WHERE id = $1`,
      [applicationId]
    );

    logger.info({ applicationId }, 'teacher application email verified');

    // Now that the email is verified, fire the full onSubmitted (applicant
    // ack + super-admin alert).
    fireNotify(
      TeacherApplicationNotifyService.onSubmitted({
        applicationId,
        email: row.email,
        fullName: row.full_name,
        subject: row.subject,
        oneSignalPlayerId: row.onesignal_player_id,
      }),
      { applicationId, hook: 'onSubmitted (post-verify)' }
    );

    return { verified: true, alreadyVerified: false };
  }

  /**
   * Re-issue a fresh OTP and re-send the verification email. Only valid
   * for email-provider applications still in pending state.
   */
  static async resendVerification(applicationId: string): Promise<{ sent: true }> {
    const { rows } = await pool.query<{
      email: string;
      full_name: string;
      application_auth_provider: string;
      application_status: TeacherApplicationStatus;
      email_verified_at: string | null;
    }>(
      `SELECT email, full_name, application_auth_provider, application_status, email_verified_at
         FROM teacher_applications
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1`,
      [applicationId]
    );
    const row = rows[0];
    if (!row) throw new ApiError(404, 'طلب الانضمام غير موجود', ErrorCodes.NOT_FOUND);
    if (row.application_auth_provider !== 'email') {
      throw new ApiError(
        400,
        'هذا الطلب لا يحتاج تحقق بريد إلكتروني',
        ErrorCodes.BUSINESS_RULE
      );
    }
    if (row.email_verified_at) {
      throw new ApiError(
        400,
        'البريد الإلكتروني تم التحقق منه مسبقاً',
        ErrorCodes.BUSINESS_RULE
      );
    }

    const plaintextOtp = generateOtp();
    const otpHash = await bcrypt.hash(plaintextOtp, BCRYPT_ROUNDS);
    const otpExpiresAt = new Date(Date.now() + EMAIL_OTP_EXPIRY_MINUTES * 60_000);

    await pool.query(
      `UPDATE teacher_applications
          SET email_verification_code_hash  = $2,
              email_verification_expires_at = $3,
              email_verification_attempts   = 0
        WHERE id = $1`,
      [applicationId, otpHash, otpExpiresAt]
    );

    fireNotify(
      sendVerificationCodeEmail({ to: row.email, fullName: row.full_name, code: plaintextOtp }),
      { applicationId, hook: 'sendVerificationCodeEmail (resend)' }
    );

    return { sent: true };
  }

  /**
   * Super-admin browse. Newest first.
   */
  static async listForAdmin(
    page: number,
    limit: number,
    filters: { status?: TeacherApplicationStatus; search?: string }
  ): Promise<{ rows: AdminListRow[]; total: number }> {
    const where: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];

    if (filters.status) {
      params.push(filters.status);
      where.push(`application_status = $${params.length}`);
    }

    if (filters.search) {
      params.push(`%${filters.search}%`);
      const idx = params.length;
      // ILIKE works on CITEXT too. Match across the most useful columns.
      where.push(
        `(full_name ILIKE $${idx} OR email ILIKE $${idx} OR phone ILIKE $${idx} OR subject ILIKE $${idx})`
      );
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows: countRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM teacher_applications ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.count ?? 0);

    params.push(limit, (page - 1) * limit);
    const { rows } = await pool.query<AdminListRow>(
      `SELECT ${APPLICATION_LIST_COLUMNS}
         FROM teacher_applications
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return { rows, total };
  }

  static async getByIdForAdmin(id: string): Promise<TeacherApplication> {
    const { rows } = await pool.query<TeacherApplication>(
      `SELECT ${APPLICATION_PUBLIC_COLUMNS}
         FROM teacher_applications
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1`,
      [id]
    );
    const app = rows[0];
    if (!app) {
      throw new ApiError(404, 'طلب الانضمام غير موجود', ErrorCodes.NOT_FOUND);
    }
    return app;
  }

  // -------------------------------------------------------------------------
  // Phase 2 — workflow actions
  // -------------------------------------------------------------------------
  //
  // All three actions run inside a single pg transaction with SELECT … FOR
  // UPDATE on the application row. This guarantees:
  //   - no double-approval / double-reject race between concurrent admins
  //   - any failure mid-flow rolls back EVERY write (users, wallet,
  //     subscription, application update) atomically
  //
  // Side-effects that can't participate in a pg transaction (QR file write,
  // Phase 4 push/email) run AFTER COMMIT, best-effort.

  /**
   * Approve a pending or needs_more_info application. Creates a teacher user,
   * a wallet, an optional free subscription, then marks the application
   * approved and NULLs out the password_hash (it now lives on users.password).
   */
  static async approve(
    applicationId: string,
    approvedById: string,
    input: TeacherApplicationApproveInput
  ): Promise<{
    applicationId: string;
    userId: string;
    teacherEmail: string;
  }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock the application row against concurrent action.
      const lockRes = await client.query<{
        id: string;
        full_name: string;
        email: string;
        phone: string;
        password_hash: string | null;
        gender: 'male' | 'female';
        birth_date: string;
        city: string;
        area: string;
        bio: string | null;
        years_of_experience: number;
        application_status: TeacherApplicationStatus;
        application_auth_provider: string;
        oauth_provider_id: string | null;
        email_verified_at: string | null;
      }>(
        `SELECT id, full_name, email, phone, password_hash,
                gender, birth_date, city, area, bio, years_of_experience,
                application_status,
                application_auth_provider, oauth_provider_id, email_verified_at
           FROM teacher_applications
          WHERE id = $1 AND deleted_at IS NULL
          FOR UPDATE`,
        [applicationId]
      );
      const app = lockRes.rows[0];
      if (!app) {
        throw new ApiError(404, 'طلب الانضمام غير موجود', ErrorCodes.NOT_FOUND);
      }

      // 2. Idempotency / state guard.
      if (app.application_status === TeacherApplicationStatus.APPROVED) {
        throw new ApiError(
          409,
          'تم الموافقة على هذا الطلب مسبقاً',
          ErrorCodes.ALREADY_PROCESSED
        );
      }
      if (app.application_status === TeacherApplicationStatus.REJECTED) {
        throw new ApiError(
          400,
          'لا يمكن الموافقة على طلب مرفوض',
          ErrorCodes.BUSINESS_RULE
        );
      }
      // pending and needs_more_info are both allowed here.

      // 3. Phase 8: email-verification gate. An email-provider application
      //    that hasn't yet verified the OTP cannot be approved — otherwise
      //    the resulting users row would have a password the applicant
      //    might not even own.
      const isGoogleProvider = app.application_auth_provider === 'google';
      const isAppleProvider = app.application_auth_provider === 'apple';
      const isEmailProvider = !isGoogleProvider && !isAppleProvider;

      if (isEmailProvider) {
        if (!app.email_verified_at) {
          throw new ApiError(
            400,
            'لا يمكن الموافقة قبل تحقق المتقدم من بريده الإلكتروني',
            ErrorCodes.BUSINESS_RULE,
            { field: 'email_verified_at' }
          );
        }
        if (!app.password_hash) {
          throw new ApiError(
            500,
            'بيانات الطلب غير مكتملة (password_hash مفقود)',
            ErrorCodes.INTERNAL_ERROR
          );
        }
      } else if (isGoogleProvider) {
        if (!app.oauth_provider_id) {
          throw new ApiError(
            500,
            'بيانات الطلب غير مكتملة (oauth_provider_id مفقود)',
            ErrorCodes.INTERNAL_ERROR
          );
        }
      }

      // 4. Final email-collision check inside the transaction (defence in
      //    depth — Phase 1's create already checks at submit time, but a new
      //    user row could have been added since).
      const userCheck = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL LIMIT 1`,
        [app.email]
      );
      if (userCheck.rows.length > 0) {
        throw new ApiError(
          409,
          'يوجد حساب بنفس البريد الإلكتروني مسبقاً',
          ErrorCodes.EMAIL_ALREADY_EXISTS
        );
      }

      // 5. Create the teacher user. Direct INSERT (not UserModel.create)
      //    because we need to participate in the outer transaction AND for
      //    email submissions we already have the bcrypt hash; UserModel.create
      //    would double-hash. For google submissions we mint a throwaway
      //    password (auth happens via the provider id, not the password).
      const passwordForUserRow = isEmailProvider
        ? app.password_hash!
        : await bcrypt.hash(`google_${app.oauth_provider_id}_${Date.now()}`, BCRYPT_ROUNDS);

      const address = `${app.city}, ${app.area}`;
      const newUserRes = await client.query<{ id: string }>(
        `INSERT INTO users (
            name, email, password,
            user_type, status,
            auth_provider, oauth_provider_id, email_verified,
            phone, address, bio, experience_years,
            gender, birth_date, city
          ) VALUES (
            $1, LOWER($2), $3,
            'teacher', 'active',
            $4, $5, true,
            $6, $7, $8, $9,
            $10, $11, $12
          )
          RETURNING id`,
        [
          app.full_name,
          app.email,
          passwordForUserRow,
          isGoogleProvider ? 'google' : (isAppleProvider ? 'apple' : 'email'),
          isEmailProvider ? null : app.oauth_provider_id,
          app.phone,
          address,
          app.bio,
          app.years_of_experience,
          app.gender,
          app.birth_date,
          app.city,
        ]
      );
      const newUserId = newUserRes.rows[0]!.id;

      // 6. Wallet — every teacher gets one with zero balance.
      await client.query(
        `INSERT INTO teacher_wallets (teacher_id, balance) VALUES ($1, 0)`,
        [newUserId]
      );

      // 7. (Phase 7) Free-subscription provisioning removed — the
      //    subscription model is gone; commission + wallet take its place.
      //    The wallet row was already created above; no further setup
      //    needed here.

      // 8. Finalise the application — set status, audit, and NULL the
      //    hash now that it lives on users.password (Decision 4).
      const adminNotes = input?.adminNotes ?? null;
      await client.query(
        `UPDATE teacher_applications
            SET application_status = 'approved',
                approved_by        = $1,
                approved_at        = NOW(),
                password_hash      = NULL,
                admin_notes        = COALESCE($2, admin_notes)
          WHERE id = $3`,
        [approvedById, adminNotes, applicationId]
      );

      await client.query('COMMIT');

      logger.info(
        { applicationId, newUserId, approvedById },
        'teacher application approved — user provisioned'
      );

      // 9. Side-effects that can't be inside the transaction. Failures are
      //    logged but do not undo the approval — a missing QR file can be
      //    regenerated by the next teacher login or by an admin tool.
      try {
        await QrService.ensureTeacherQr(newUserId);
      } catch (err) {
        logger.warn(
          { err, newUserId, applicationId },
          'post-approval QR generation failed (best-effort)'
        );
      }

      // Phase 4: fire-and-forget welcome (push via external_user_id +
      // approval email). Caller already has its response on the way back.
      fireNotify(
        TeacherApplicationNotifyService.onApproved({
          applicationId,
          userId: newUserId,
          email: app.email,
          fullName: app.full_name,
        }),
        { applicationId, hook: 'onApproved' }
      );

      return {
        applicationId,
        userId: newUserId,
        teacherEmail: app.email,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Reject a pending or needs_more_info application. The rejection_reason
   * will be shown to the applicant (Phase 4 notification); admin_notes is
   * private to the dashboard.
   */
  static async reject(
    applicationId: string,
    rejectedById: string,
    input: TeacherApplicationRejectInput
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const lockRes = await client.query<{
        application_status: TeacherApplicationStatus;
        email: string;
        full_name: string;
        onesignal_player_id: string | null;
      }>(
        `SELECT application_status, email, full_name, onesignal_player_id
           FROM teacher_applications
          WHERE id = $1 AND deleted_at IS NULL
          FOR UPDATE`,
        [applicationId]
      );
      const row = lockRes.rows[0];
      if (!row) {
        throw new ApiError(404, 'طلب الانضمام غير موجود', ErrorCodes.NOT_FOUND);
      }

      if (row.application_status === TeacherApplicationStatus.APPROVED) {
        throw new ApiError(
          409,
          'لا يمكن رفض طلب تم الموافقة عليه',
          ErrorCodes.ALREADY_PROCESSED
        );
      }
      if (row.application_status === TeacherApplicationStatus.REJECTED) {
        throw new ApiError(
          409,
          'تم رفض هذا الطلب مسبقاً',
          ErrorCodes.ALREADY_PROCESSED
        );
      }

      await client.query(
        `UPDATE teacher_applications
            SET application_status = 'rejected',
                rejection_reason   = $1,
                admin_notes        = COALESCE($2, admin_notes),
                rejected_at        = NOW(),
                approved_by        = $3
          WHERE id = $4`,
        [
          input.rejectionReason,
          input.adminNotes ?? null,
          rejectedById,
          applicationId,
        ]
      );

      await client.query('COMMIT');

      logger.info(
        { applicationId, rejectedById },
        'teacher application rejected'
      );

      // Phase 4: rejection notify (email always; push if we have a player id).
      fireNotify(
        TeacherApplicationNotifyService.onRejected({
          applicationId,
          email: row.email,
          fullName: row.full_name,
          rejectionReason: input.rejectionReason,
          oneSignalPlayerId: row.onesignal_player_id,
        }),
        { applicationId, hook: 'onRejected' }
      );
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Move a pending application to needs_more_info with admin notes the
   * applicant will see. Only allowed from 'pending' to avoid bouncing an
   * application around the queue.
   */
  static async requestMoreInfo(
    applicationId: string,
    requestedById: string,
    input: TeacherApplicationNeedsMoreInfoInput
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const lockRes = await client.query<{
        application_status: TeacherApplicationStatus;
        email: string;
        full_name: string;
        onesignal_player_id: string | null;
      }>(
        `SELECT application_status, email, full_name, onesignal_player_id
           FROM teacher_applications
          WHERE id = $1 AND deleted_at IS NULL
          FOR UPDATE`,
        [applicationId]
      );
      const row = lockRes.rows[0];
      if (!row) {
        throw new ApiError(404, 'طلب الانضمام غير موجود', ErrorCodes.NOT_FOUND);
      }
      if (row.application_status !== TeacherApplicationStatus.PENDING) {
        throw new ApiError(
          400,
          'يمكن طلب معلومات إضافية فقط للطلبات في انتظار المراجعة',
          ErrorCodes.BUSINESS_RULE,
          { currentStatus: row.application_status }
        );
      }

      await client.query(
        `UPDATE teacher_applications
            SET application_status  = 'needs_more_info',
                admin_notes         = $1,
                needs_more_info_at  = NOW(),
                approved_by         = $2
          WHERE id = $3`,
        [input.adminNotes, requestedById, applicationId]
      );

      await client.query('COMMIT');

      logger.info(
        { applicationId, requestedById },
        'teacher application moved to needs_more_info'
      );

      // Phase 4: needs-more-info notify (email always; push if device known).
      fireNotify(
        TeacherApplicationNotifyService.onNeedsMoreInfo({
          applicationId,
          email: row.email,
          fullName: row.full_name,
          adminNotes: input.adminNotes,
          oneSignalPlayerId: row.onesignal_player_id,
        }),
        { applicationId, hook: 'onNeedsMoreInfo' }
      );
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
