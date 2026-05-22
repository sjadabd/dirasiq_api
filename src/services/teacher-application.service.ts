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
import { QrService } from './qr.service';
import type {
  TeacherApplicationCreateInput,
  TeacherApplicationApproveInput,
  TeacherApplicationRejectInput,
  TeacherApplicationNeedsMoreInfoInput,
} from '../schemas/teacher-application.schemas';

const BCRYPT_ROUNDS = Number(process.env['BCRYPT_ROUNDS'] || 12);
const REJECTION_COOLDOWN_DAYS = 30;

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
   * Public submission. Throws ApiError on any violation; the controller
   * surfaces those via the canonical envelope.
   */
  static async create(
    input: TeacherApplicationCreateInput
  ): Promise<{
    id: string;
    applicationStatus: TeacherApplicationStatus;
    uploadToken: string;
    uploadTokenExpiresInSeconds: number;
  }> {
    const email = input.email; // already lowercased/trimmed by emailSchema
    const phone = input.phone;

    // ---- 1. Block if a real users row already exists ---------------------
    const existingUser = await UserModel.findByEmail(email);
    if (existingUser) {
      throw new ApiError(
        409,
        'هذا البريد الإلكتروني مرتبط بحساب موجود مسبقاً',
        ErrorCodes.EMAIL_ALREADY_EXISTS
      );
    }

    // ---- 2. Block if an active application already exists for that email
    //         OR phone, and enforce the 30-day cooldown for rejected rows.
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
        const ageDays =
          (Date.now() - rejectedAt.getTime()) / (24 * 60 * 60 * 1000);
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

    // ---- 3. Hash the password ---------------------------------------------
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const fullName = `${input.firstName} ${input.lastName}`.trim();

    // ---- 4. Insert (the partial unique index defends against races) -------
    try {
      const { rows } = await pool.query<{
        id: string;
        application_status: TeacherApplicationStatus;
      }>(
        `INSERT INTO teacher_applications (
           first_name, last_name, full_name,
           phone, email, password_hash,
           gender, birth_date, city, area,
           subject, teaching_stage, years_of_experience, current_workplace,
           has_physical_courses, estimated_student_count,
           bio,
           facebook_url, instagram_url, telegram_url, tiktok_url, youtube_url
         ) VALUES (
           $1,$2,$3,
           $4,$5,$6,
           $7,$8,$9,$10,
           $11,$12,$13,$14,
           $15,$16,
           $17,
           $18,$19,$20,$21,$22
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
        ]
      );

      const created = rows[0]!;
      // Phase 3: issue a short-lived upload token bound to this
      // application id. The Flutter client uses it to attach the
      // certificate / national-id / profile / intro-video files via
      // POST /api/teacher-applications/<id>/files within 30 minutes.
      const tokenInfo = signUploadToken(created.id);
      logger.info({ applicationId: created.id }, 'teacher application submitted');
      return {
        id: created.id,
        applicationStatus: created.application_status,
        uploadToken: tokenInfo.token,
        uploadTokenExpiresInSeconds: tokenInfo.expiresInSeconds,
      };
    } catch (err: unknown) {
      // 23505 = unique_violation. Hit only under a race against the partial
      // unique index — surface as the same 409 as the explicit check above.
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
      }>(
        `SELECT id, full_name, email, phone, password_hash,
                gender, birth_date, city, area, bio, years_of_experience,
                application_status
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

      // 3. password_hash sanity — Phase 2 expects it present. Phase 3+
      //    will NULL it after the first approval, so any approved row
      //    after that point won't reach here.
      if (!app.password_hash) {
        throw new ApiError(
          500,
          'بيانات الطلب غير مكتملة',
          ErrorCodes.INTERNAL_ERROR
        );
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
      //    because we need to participate in the outer transaction AND we
      //    already have a bcrypt hash; UserModel.create would double-hash.
      const address = `${app.city}, ${app.area}`;
      const newUserRes = await client.query<{ id: string }>(
        `INSERT INTO users (
            name, email, password,
            user_type, status,
            auth_provider, email_verified,
            phone, address, bio, experience_years,
            gender, birth_date, city
          ) VALUES (
            $1, LOWER($2), $3,
            'teacher', 'active',
            'email', true,
            $4, $5, $6, $7,
            $8, $9, $10
          )
          RETURNING id`,
        [
          app.full_name,
          app.email,
          app.password_hash,
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

      // 7. Free subscription — best-effort. We INSERT directly (no model
      //    call) so it stays inside the transaction.
      const freePkgRes = await client.query<{
        id: string;
        duration_days: number;
      }>(
        `SELECT id, duration_days
           FROM subscription_packages
          WHERE is_free = true
            AND is_active = true
            AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1`
      );
      if (freePkgRes.rows.length > 0) {
        const pkg = freePkgRes.rows[0]!;
        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setDate(
          endDate.getDate() + Number(pkg.duration_days || 30)
        );
        await client.query(
          `INSERT INTO teacher_subscriptions
             (teacher_id, subscription_package_id, start_date, end_date)
           VALUES ($1, $2, $3, $4)`,
          [newUserId, pkg.id, startDate, endDate]
        );
      } else {
        logger.info(
          { applicationId },
          'approve: no active free subscription package configured — skipping'
        );
      }

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
      }>(
        `SELECT application_status
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
      }>(
        `SELECT application_status
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
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
