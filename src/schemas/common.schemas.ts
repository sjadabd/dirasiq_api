// Reusable Zod schemas shared across the API.
//
// Anything that appears in more than one route lives here. Domain-specific
// composition is done in the per-domain schemas file (e.g. `auth.schemas.ts`).
//
// Pattern note: query schemas use `z.coerce.*` so `?page=2` arrives as a
// number. Body schemas use plain `z.number()` so the dashboard / Flutter
// can't smuggle stringly-typed numbers in.

import { z } from 'zod';

// ---- Primitives -----------------------------------------------------------

export const uuidSchema = z.string().uuid('المعرف غير صالح');

export const studyYearSchema = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{4}$/, 'تنسيق السنة الدراسية غير صحيح');

export const moneySchema = z.coerce
  .number({ message: 'القيمة المالية غير صالحة' })
  .nonnegative('القيمة المالية يجب ألا تكون سالبة');

export const positiveMoneySchema = z.coerce
  .number({ message: 'القيمة المالية غير صالحة' })
  .positive('القيمة المالية يجب أن تكون أكبر من صفر');

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, 'تنسيق التاريخ غير صحيح (YYYY-MM-DD)');

export const isoDateTimeSchema = z
  .string()
  .datetime({ message: 'تنسيق التاريخ والوقت غير صحيح (ISO 8601)' })
  .or(isoDateSchema);

export const hhmmTimeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'صيغة الوقت غير صحيحة (HH:MM أو HH:MM:SS)');

export const weekdaySchema = z.coerce
  .number()
  .int()
  .min(0, 'يوم الأسبوع يجب أن يكون بين 0 و 6')
  .max(6, 'يوم الأسبوع يجب أن يكون بين 0 و 6');

// ---- Common params --------------------------------------------------------

export const idParamSchema = z.object({ id: uuidSchema });
export const courseIdParamSchema = z.object({ courseId: uuidSchema });
export const sessionIdParamSchema = z.object({ sessionId: uuidSchema });
export const invoiceIdParamSchema = z.object({ invoiceId: uuidSchema });
export const bookingIdParamSchema = z.object({ bookingId: uuidSchema });
export const teacherIdParamSchema = z.object({ teacherId: uuidSchema });
export const studentIdParamSchema = z.object({ studentId: uuidSchema });

export const assignmentGradeParamsSchema = z.object({
  assignmentId: uuidSchema,
  studentId: uuidSchema,
});

export const examGradeParamsSchema = z.object({
  examId: uuidSchema,
  studentId: uuidSchema,
});

export const assignmentSubmissionParamsSchema = z.object({
  assignmentId: uuidSchema,
  studentId: uuidSchema,
});

// ---- Common query helpers -------------------------------------------------

/**
 * Pre-processor that turns the legacy string sentinels `'null'`, `'undefined'`
 * and empty strings into `undefined`, so that `.optional()` schemas don't
 * reject them. Many dashboard pages still send these from un-cleared filters.
 *
 * The output is always wrapped in `.optional()` — after preprocessing the
 * value can legitimately be `undefined` (no filter), so the inner schema
 * must accept that.
 */
const nullishString = (schema: z.ZodTypeAny): z.ZodTypeAny =>
  z.preprocess((v) => {
    if (v === null || v === undefined) return undefined;
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return undefined;
      return trimmed;
    }
    return v;
  }, schema.optional());

export const optionalString = nullishString(z.string());
export const optionalUuid = nullishString(uuidSchema);
export const optionalStudyYear = nullishString(studyYearSchema);

/**
 * Accepts `'true'` / `'false'` / boolean / nullish. Returns `boolean | undefined`.
 * Useful for `?deleted=true` / `?deleted=false` style filters.
 */
export const optionalBooleanQuery = z.preprocess((v) => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const trimmed = v.trim().toLowerCase();
    if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return undefined;
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
  }
  return v;
}, z.boolean().optional());

// ---- Pagination -----------------------------------------------------------

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export type PaginationQueryInput = z.infer<typeof paginationQuerySchema>;
