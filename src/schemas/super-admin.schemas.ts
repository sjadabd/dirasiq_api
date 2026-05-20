// Zod schemas for /api/super-admin/*, /api/academic-years/*, /api/grades/*,
// /api/news/*, /api/subjects/* (when targeted by super-admin) and the
// shared subscription-package endpoints.
//
// Reusable primitives come from `common.schemas.ts`.

import { z } from 'zod';

import {
  isoDateSchema,
  moneySchema,
  optionalBooleanQuery,
  optionalString,
  optionalStudyYear,
  paginationQuerySchema,
  studyYearSchema,
} from './common.schemas';

// =============================================================================
// Academic year
// =============================================================================

export const academicYearCreateSchema = z.object({
  year: studyYearSchema,
});

export const academicYearUpdateSchema = z.object({
  year: studyYearSchema.optional(),
  is_active: z.boolean().optional(),
});

export const academicYearListQuerySchema = paginationQuerySchema.extend({
  search: optionalString,
  is_active: optionalBooleanQuery,
});

// =============================================================================
// Grade
// =============================================================================

export const gradeCreateSchema = z.object({
  name: z.string().trim().min(1, 'اسم الصف مطلوب'),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const gradeUpdateSchema = z.object({
  name: z.string().trim().min(1, 'اسم الصف مطلوب').optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const gradeListQuerySchema = paginationQuerySchema.extend({
  search: optionalString,
});

export const userGradesQuerySchema = z.object({
  study_year: optionalStudyYear,
});

// =============================================================================
// News
// =============================================================================

const newsTypeSchema = z.enum(['web', 'mobile', 'web_and_mobile']);

// Reject obviously-unsupported image formats at the validator boundary. Same
// allowlist as the controller's `ALLOWED_IMAGE_MIME_TO_EXT` (jpg/png/webp).
// Non-data-URI strings (regular URL paths) pass through untouched — the
// controller's logic only triggers when the string starts with `data:image`.
const newsImageUrlSchema = z
  .string()
  .refine(
    (v) => {
      if (!v.startsWith('data:image')) return true;
      return /^data:image\/(jpe?g|png|webp);base64,/i.test(v);
    },
    {
      message: 'صيغة الصورة غير مدعومة. الصيغ المسموح بها: JPG, PNG, أو WEBP.',
    }
  );

export const newsCreateSchema = z.object({
  title: z.string().trim().min(1, 'عنوان الخبر مطلوب'),
  details: z.string().trim().min(1, 'تفاصيل الخبر مطلوبة'),
  imageUrl: newsImageUrlSchema.optional(),
  newsType: newsTypeSchema.optional(),
});

export const newsUpdateSchema = z.object({
  title: z.string().trim().min(1, 'عنوان الخبر مطلوب').optional(),
  details: z.string().trim().min(1, 'تفاصيل الخبر مطلوبة').optional(),
  imageUrl: newsImageUrlSchema.optional(),
  newsType: newsTypeSchema.optional(),
  isActive: z.boolean().optional(),
});

export const newsListQuerySchema = paginationQuerySchema.extend({
  search: optionalString,
  isActive: optionalBooleanQuery,
  newsType: newsTypeSchema.optional(),
});

// =============================================================================
// Settings
// =============================================================================

export const bookingConfirmFeeBodySchema = z.object({
  feeIqd: moneySchema,
});

// =============================================================================
// Super-admin teacher listing
// =============================================================================

export const superAdminTeacherListQuerySchema = paginationQuerySchema.extend({
  search: optionalString,
});

// =============================================================================
// Subscription package
// =============================================================================

export const subscriptionPackageCreateSchema = z.object({
  name: z.string().trim().min(1, 'الاسم مطلوب'),
  description: z.string().max(1000, 'الوصف طويل جداً').optional(),
  maxStudents: z.coerce.number().int().min(1, 'عدد الطلاب مطلوب'),
  price: moneySchema,
  durationDays: z.coerce.number().int().min(1, 'مدة الباقة مطلوبة'),
  isFree: z.boolean().optional(),
});

export const subscriptionPackageUpdateSchema = z.object({
  name: z.string().trim().min(1, 'الاسم مطلوب').optional(),
  description: z.string().max(1000, 'الوصف طويل جداً').optional(),
  maxStudents: z.coerce.number().int().min(1, 'عدد الطلاب مطلوب').optional(),
  price: moneySchema.optional(),
  durationDays: z.coerce.number().int().min(1, 'مدة الباقة مطلوبة').optional(),
  isFree: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const subscriptionPackageListQuerySchema = paginationQuerySchema.extend({
  search: z.string().max(100, 'البحث طويل جداً').optional(),
  isActive: optionalBooleanQuery,
  isFree: optionalBooleanQuery,
  deleted: optionalBooleanQuery,
  sortBy: z.string().optional(),
});

// =============================================================================
// Public news (top-level)
// =============================================================================

export const publicNewsListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).optional(),
});

// =============================================================================
// Generic dates passed through (reserved for endpoints that accept date filters)
// =============================================================================

export const dateRangeQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
