// Zod schemas for /api/{public,student,teacher,super-admin}/video-courses/*
// and /api/webhooks/bunny/video-status.
//
// Phase 10.1.A ships read endpoints + super-admin moderation (reject/hide/
// approve/delete) + the Bunny webhook receiver. Write/upload schemas
// (teacher create lesson, replace cover image, etc.) ship in 10.1.B and
// will be added to this file then.

import { z } from 'zod';

import { VideoCourseStatus, VideoCourseVisibility } from '../types';
import {
  optionalString,
  paginationQuerySchema,
  uuidSchema,
} from './common.schemas';

// ----------------------------------------------------------------------------
// Param + query schemas (shared across surfaces)
// ----------------------------------------------------------------------------

export const videoCourseIdParamSchema = z.object({
  id: uuidSchema,
});

export const videoCourseLessonIdParamSchema = z.object({
  id: uuidSchema,
  lessonId: uuidSchema,
});

const videoCourseStatusEnum = z.enum([
  VideoCourseStatus.PENDING_REVIEW,
  VideoCourseStatus.APPROVED,
  VideoCourseStatus.HIDDEN,
  VideoCourseStatus.REJECTED,
]);

const videoCourseVisibilityEnum = z.enum([
  VideoCourseVisibility.PRIVATE,
  VideoCourseVisibility.PUBLIC,
]);

// Public + student list — strict (no status / visibility filter; the service
// hard-codes approved + public). Only paginated browse fields.
export const videoCoursePublicListQuerySchema = paginationQuerySchema.extend({
  subject: optionalString,
  teachingStage: optionalString,
});

// Teacher list — own courses, status filter optional.
export const videoCourseTeacherListQuerySchema = paginationQuerySchema.extend({
  status: videoCourseStatusEnum.optional(),
});

// Super-admin list — any status + free-text search.
export const videoCourseAdminListQuerySchema = paginationQuerySchema.extend({
  status: videoCourseStatusEnum.optional(),
  visibility: videoCourseVisibilityEnum.optional(),
  subject: optionalString,
  teachingStage: optionalString,
  teacherId: uuidSchema.optional(),
  search: optionalString,
});

export type VideoCoursePublicListQuery = z.infer<typeof videoCoursePublicListQuerySchema>;
export type VideoCourseTeacherListQuery = z.infer<typeof videoCourseTeacherListQuerySchema>;
export type VideoCourseAdminListQuery = z.infer<typeof videoCourseAdminListQuerySchema>;

// ----------------------------------------------------------------------------
// Teacher write bodies — Phase 10.1.B
// ----------------------------------------------------------------------------

// `course_type` style fields — kept lenient on length; the DB CHECK is the
// last line of defence. Visibility defaults to `private` so a newly-created
// course is invisible until the teacher explicitly publishes (and the
// admin approves).
const courseTitleSchema = z.string().trim().min(1, 'العنوان مطلوب').max(200, 'العنوان طويل جداً');
const courseDescriptionSchema = z.string().trim().max(10_000, 'الوصف طويل جداً');
const courseSubjectSchema = z.string().trim().min(1, 'المادة مطلوبة').max(100, 'المادة طويلة جداً');
const courseStageSchema = z.string().trim().min(1, 'المرحلة مطلوبة').max(100, 'المرحلة طويلة جداً');

// hasPhysicalCourses-style boolean coercion — Flutter sometimes serialises
// booleans to strings in multipart bodies.
const coerceBool = z.preprocess((v) => {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return v;
}, z.boolean());

// price expressed as a non-negative number coerced from string-or-number
// because multipart bodies pass it as a string.
const priceSchema = z.coerce.number().nonnegative('السعر يجب أن يكون 0 أو أكثر').max(1_000_000);

export const videoCourseCreateSchema = z.object({
  title: courseTitleSchema,
  description: courseDescriptionSchema.optional(),
  subject: courseSubjectSchema,
  teachingStage: courseStageSchema,
  gradeId: uuidSchema.optional(),
  isFree: coerceBool.optional(),
  price: priceSchema.optional(),
  visibility: videoCourseVisibilityEnum.optional(),
});
export type VideoCourseCreateInput = z.infer<typeof videoCourseCreateSchema>;

// Update: same fields, all optional, but the body must have at least one
// recognised key. Status fields are intentionally NOT here — they are
// super-admin owned.
export const videoCourseUpdateSchema = z
  .object({
    title: courseTitleSchema.optional(),
    description: courseDescriptionSchema.optional(),
    subject: courseSubjectSchema.optional(),
    teachingStage: courseStageSchema.optional(),
    gradeId: uuidSchema.optional(),
    isFree: coerceBool.optional(),
    price: priceSchema.optional(),
    visibility: videoCourseVisibilityEnum.optional(),
  })
  .refine((obj) => Object.values(obj).some((v) => v !== undefined), {
    message: 'يجب تمرير حقل واحد على الأقل للتحديث',
  });
export type VideoCourseUpdateInput = z.infer<typeof videoCourseUpdateSchema>;

// ----------------------------------------------------------------------------
// Admin moderation bodies
// ----------------------------------------------------------------------------

export const videoCourseRejectSchema = z.object({
  reviewNotes: z
    .string()
    .trim()
    .min(3, 'سبب الرفض مطلوب')
    .max(2000, 'سبب الرفض طويل جداً'),
});
export type VideoCourseRejectInput = z.infer<typeof videoCourseRejectSchema>;

export const videoCourseHideSchema = z
  .object({
    reviewNotes: z.string().trim().max(2000, 'الملاحظة طويلة جداً').optional(),
  })
  .optional();
export type VideoCourseHideInput = z.infer<typeof videoCourseHideSchema>;

export const videoCourseApproveSchema = z
  .object({
    reviewNotes: z.string().trim().max(2000, 'الملاحظة طويلة جداً').optional(),
  })
  .optional();
export type VideoCourseApproveInput = z.infer<typeof videoCourseApproveSchema>;

// ----------------------------------------------------------------------------
// Bunny webhook body
// ----------------------------------------------------------------------------
//
// Bunny Stream Webhook fields (https://docs.bunny.net/reference/stream-webhook):
//   - VideoLibraryId (number)
//   - VideoGuid (string, UUID)
//   - Status (number — 0=Created, 1=Uploaded, 2=Processing, 3=Transcoding,
//             4=Finished, 5=Error, 6=UploadFailed, 7=JitSegmenting,
//             8=JitPlaylistsCreated)
//
// We accept the raw Bunny shape (capitalised) and let the service translate
// to our internal VideoLessonBunnyStatus enum. The schema is permissive on
// purpose — Bunny adds fields over time and a strict schema would reject
// otherwise-valid webhooks.

export const bunnyWebhookSchema = z
  .object({
    VideoLibraryId: z.coerce.number().int().nonnegative().optional(),
    VideoGuid: z.string().trim().min(8, 'VideoGuid is required'),
    Status: z.coerce.number().int().min(0).max(20),
  })
  .passthrough();

export type BunnyWebhookInput = z.infer<typeof bunnyWebhookSchema>;
