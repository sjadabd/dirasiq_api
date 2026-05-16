// Zod schemas for /api/student/*.
//
// Organised by domain. Field-level error messages are Arabic-first.
// Reusable primitives come from `common.schemas.ts`; teacher-side cousins
// (booking, evaluation) live in `teacher.schemas.ts` and are intentionally
// not re-exported — the student-side input shapes differ.

import { z } from 'zod';

import {
  isoDateSchema,
  optionalString,
  optionalStudyYear,
  optionalUuid,
  paginationQuerySchema,
  studyYearSchema,
  uuidSchema,
} from './common.schemas';

// =============================================================================
// Course
// =============================================================================

export const suggestedCoursesQuerySchema = z.object({
  maxDistance: z.coerce.number().min(0.1).max(50).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// =============================================================================
// Course booking (student side)
// =============================================================================

export const createCourseBookingSchema = z.object({
  courseId: uuidSchema,
  studentMessage: z.string().optional(),
});

export const studentBookingsListQuerySchema = paginationQuerySchema.extend({
  studyYear: studyYearSchema,
  status: optionalString,
});

export const studentBookingStatsQuerySchema = z.object({
  studyYear: studyYearSchema,
});

export const studentCancelBookingBodySchema = z.object({
  reason: z.string().optional(),
});

// =============================================================================
// Enrollment
// =============================================================================

export const enrollmentListQuerySchema = paginationQuerySchema;

export const weeklyScheduleQuerySchema = z.object({
  weekStart: isoDateSchema.optional(),
});

// =============================================================================
// Attendance
// =============================================================================

export const attendanceCheckInBodySchema = z.object({
  teacherId: uuidSchema,
});

// =============================================================================
// Search
// =============================================================================

export const studentUnifiedSearchQuerySchema = z.object({
  q: optionalString,
  maxDistance: z.coerce.number().min(0.5).max(50).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// =============================================================================
// Teacher (browsing teachers)
// =============================================================================

export const suggestedTeachersQuerySchema = z.object({
  maxDistance: z.coerce.number().min(0.1).max(50).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: optionalString,
});

export const teacherSubjectsCoursesQuerySchema = paginationQuerySchema.extend({
  search: optionalString,
  gradeId: optionalUuid,
  subjectId: optionalUuid,
  studyYear: optionalStudyYear,
});

// =============================================================================
// Assignment (student submission)
// =============================================================================

export const studentAssignmentListQuerySchema = paginationQuerySchema;

const submissionAttachmentSchema = z.object({
  base64: z.string().optional(),
  url: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  size: z.coerce.number().optional(),
}).passthrough();

export const studentAssignmentSubmitBodySchema = z.object({
  content_text: z.string().nullable().optional(),
  link_url: z.string().nullable().optional(),
  attachments: z
    .union([
      z.array(submissionAttachmentSchema),
      z.object({ files: z.array(submissionAttachmentSchema).optional() }).passthrough(),
    ])
    .optional(),
  status: z.enum(['submitted', 'late', 'returned']).optional(),
});

// =============================================================================
// Exam
// =============================================================================

const examTypeSchema = z.enum(['daily', 'monthly']);

export const studentExamListQuerySchema = paginationQuerySchema.extend({
  type: examTypeSchema.optional(),
});

export const studentExamReportQuerySchema = z.object({
  type: examTypeSchema.optional(),
});

// =============================================================================
// Student evaluation
// =============================================================================

export const studentEvaluationListQuerySchema = paginationQuerySchema.extend({
  from: optionalString,
  to: optionalString,
});

// =============================================================================
// Invoice (student side)
// =============================================================================

export const studentInvoiceListQuerySchema = paginationQuerySchema.extend({
  studyYear: optionalStudyYear,
  courseId: optionalUuid,
  status: z.enum(['pending', 'partial', 'paid', 'overdue', 'cancelled']).optional(),
});

export const installmentIdParamSchema = z.object({
  invoiceId: uuidSchema,
  installmentId: uuidSchema,
});
