import { z } from 'zod';

import { paginationQuerySchema, uuidSchema } from './common.schemas';

export const advertisementVisibilitySchema = z.enum(['public', 'governorate_only']);

export const advertisementStatusSchema = z.enum([
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'running',
  'finished',
  'budget_exhausted',
]);

export const advertisementCreateSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  coverImageUrl: z.string().optional().nullable(),
  visibility: advertisementVisibilitySchema.default('public'),
  budgetTotal: z.coerce.number().nonnegative().optional(),
});

export const advertisementUpdateSchema = advertisementCreateSchema.partial();

export const advertisementListQuerySchema = paginationQuerySchema.extend({
  status: advertisementStatusSchema.optional(),
});

export const advertisementAdminListQuerySchema = paginationQuerySchema.extend({
  status: advertisementStatusSchema.optional(),
  teacherId: uuidSchema.optional(),
});

export const advertisementRejectSchema = z.object({
  reason: z.string().trim().min(3).max(2000),
});

export const advertisementApproveSchema = z.object({
  adminNotes: z.string().trim().max(2000).optional().nullable(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const advertisementSettingsUpdateSchema = z.object({
  costPerClick: z.coerce.number().positive().optional(),
  minBudget: z.coerce.number().positive().optional(),
  maxBudget: z.coerce.number().positive().optional(),
  maxDurationDays: z.coerce.number().int().positive().optional(),
  autoEndDurationDays: z.coerce.number().int().positive().optional(),
  allowPublic: z.coerce.boolean().optional(),
  allowGovernorate: z.coerce.boolean().optional(),
  requireApproval: z.coerce.boolean().optional(),
  maxActivePerTeacher: z.coerce.number().int().positive().optional(),
  imageSizeLimitBytes: z.coerce.number().int().positive().optional(),
  maxTitleLength: z.coerce.number().int().positive().optional(),
  maxDescriptionLength: z.coerce.number().int().positive().optional(),
  refundUnusedBudget: z.coerce.boolean().optional(),
  freeClicksEnabled: z.coerce.boolean().optional(),
});

export const contentFeedQuerySchema = paginationQuerySchema;
