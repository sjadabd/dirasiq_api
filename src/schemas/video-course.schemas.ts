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
