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
import type { TeacherApplicationCreateInput } from '../schemas/teacher-application.schemas';

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
  ): Promise<{ id: string; applicationStatus: TeacherApplicationStatus }> {
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
      logger.info({ applicationId: created.id }, 'teacher application submitted');
      return {
        id: created.id,
        applicationStatus: created.application_status,
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
}
