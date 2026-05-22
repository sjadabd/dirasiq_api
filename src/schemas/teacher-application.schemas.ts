// Zod schemas for /api/teacher-applications/* (public submit) and the
// super-admin read endpoints under /api/super-admin/teacher-applications/*.
//
// Phase 1 covers the schema, the public submit, and the admin list/detail
// reads. The action endpoints (approve / reject / request-more-info) and the
// file-upload payloads are Phase 2 / Phase 3.

import { z } from 'zod';

import { TeacherApplicationStatus } from '../types';
import {
  birthDateSchema,
  emailSchema,
  passwordWeakSchema,
} from './auth.schemas';
import {
  idParamSchema,
  optionalString,
  paginationQuerySchema,
} from './common.schemas';

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

// A social-handle field accepts either a real URL or a short @handle / path.
// We trim, normalise empty-string → undefined, and cap length. URL strictness
// is deferred — TikTok/Telegram users routinely paste handles, not URLs.
const socialHandle = z
  .string()
  .trim()
  .max(500, 'الرابط طويل جداً')
  .transform((v) => (v === '' ? undefined : v))
  .optional();

const phoneSchema = z
  .string()
  .trim()
  .min(10, 'رقم الهاتف يجب أن يحتوي على 10 إلى 15 رقم')
  .max(15, 'رقم الهاتف يجب أن يحتوي على 10 إلى 15 رقم');

const genderSchema = z.enum(['male', 'female'], 'الجنس غير صحيح');

// hasPhysicalCourses: accept boolean OR string "true"/"false" (Flutter sometimes serialises booleans
// to strings in multipart bodies — Phase 1 is JSON-only but be lenient).
const coerceBool = z.preprocess((v) => {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return v;
}, z.boolean());

// ---------------------------------------------------------------------------
// Public — submit a new application
// ---------------------------------------------------------------------------

export const teacherApplicationCreateSchema = z.object({
  firstName: z.string().trim().min(1, 'الاسم الأول مطلوب').max(100, 'الاسم الأول طويل جداً'),
  lastName: z.string().trim().min(1, 'الاسم الأخير مطلوب').max(100, 'الاسم الأخير طويل جداً'),
  phone: phoneSchema,
  email: emailSchema,
  password: passwordWeakSchema,

  gender: genderSchema,
  birthDate: birthDateSchema,

  city: z.string().trim().min(1, 'المدينة مطلوبة').max(100, 'اسم المدينة طويل جداً'),
  area: z.string().trim().min(1, 'المنطقة مطلوبة').max(100, 'اسم المنطقة طويل جداً'),

  subject: z.string().trim().min(1, 'المادة مطلوبة').max(100, 'اسم المادة طويل جداً'),
  teachingStage: z.string().trim().min(1, 'المرحلة الدراسية مطلوبة').max(100, 'اسم المرحلة طويل جداً'),
  yearsOfExperience: z.coerce
    .number()
    .int('سنوات الخبرة يجب أن تكون عدداً صحيحاً')
    .min(0, 'سنوات الخبرة لا يمكن أن تكون سالبة')
    .max(60, 'سنوات الخبرة كبيرة جداً'),
  currentWorkplace: z
    .string()
    .trim()
    .max(255, 'مكان العمل طويل جداً')
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
  hasPhysicalCourses: coerceBool,
  estimatedStudentCount: z.coerce
    .number()
    .int('عدد الطلاب يجب أن يكون عدداً صحيحاً')
    .min(0, 'عدد الطلاب لا يمكن أن يكون سالباً')
    .max(100000, 'الرقم كبير جداً'),

  bio: z
    .string()
    .trim()
    .max(2000, 'النبذة طويلة جداً')
    .transform((v) => (v === '' ? undefined : v))
    .optional(),

  facebookUrl: socialHandle,
  instagramUrl: socialHandle,
  telegramUrl: socialHandle,
  tiktokUrl: socialHandle,
  youtubeUrl: socialHandle,
});

export type TeacherApplicationCreateInput = z.infer<typeof teacherApplicationCreateSchema>;

// ---------------------------------------------------------------------------
// Super-admin — list + detail
// ---------------------------------------------------------------------------

const applicationStatusEnumSchema = z.enum([
  TeacherApplicationStatus.PENDING,
  TeacherApplicationStatus.APPROVED,
  TeacherApplicationStatus.REJECTED,
  TeacherApplicationStatus.NEEDS_MORE_INFO,
]);

export const teacherApplicationListQuerySchema = paginationQuerySchema.extend({
  status: applicationStatusEnumSchema.optional(),
  search: optionalString,
});

export type TeacherApplicationListQuery = z.infer<typeof teacherApplicationListQuerySchema>;

// Reuse the shared `{ id }` UUID param schema so the route parser produces a
// fully-validated UUID before reaching the handler.
export const teacherApplicationIdParamSchema = idParamSchema;

// ---------------------------------------------------------------------------
// Super-admin — actions (approve / reject / needs-more-info)
// ---------------------------------------------------------------------------

// Approve has an optional `adminNotes` only. The body itself is optional —
// `PATCH /:id/approve` with no body is the common case.
export const teacherApplicationApproveBodySchema = z
  .object({
    adminNotes: z
      .string()
      .trim()
      .max(2000, 'الملاحظات طويلة جداً')
      .transform((v) => (v === '' ? undefined : v))
      .optional(),
  })
  .optional();

export type TeacherApplicationApproveInput = z.infer<
  typeof teacherApplicationApproveBodySchema
>;

// Reject — rejection_reason is mandatory (the teacher will see it). Admin
// notes are private and optional.
export const teacherApplicationRejectBodySchema = z.object({
  rejectionReason: z
    .string()
    .trim()
    .min(5, 'سبب الرفض مطلوب (5 أحرف على الأقل)')
    .max(2000, 'سبب الرفض طويل جداً'),
  adminNotes: z
    .string()
    .trim()
    .max(2000, 'الملاحظات طويلة جداً')
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
});

export type TeacherApplicationRejectInput = z.infer<
  typeof teacherApplicationRejectBodySchema
>;

// Needs-more-info — the admin spells out what's missing. The applicant will
// see this through the (Phase 4) notification + email.
export const teacherApplicationNeedsMoreInfoBodySchema = z.object({
  adminNotes: z
    .string()
    .trim()
    .min(5, 'يرجى تحديد المعلومات المطلوبة (5 أحرف على الأقل)')
    .max(2000, 'النص طويل جداً'),
});

export type TeacherApplicationNeedsMoreInfoInput = z.infer<
  typeof teacherApplicationNeedsMoreInfoBodySchema
>;
