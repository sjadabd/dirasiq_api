// Zod schemas for the remaining surfaces:
//   - /api/user/onesignal-*
//   - /api/teacher-search/*
//   - /api/payments/wayl/webhook
//
// These are small enough that a single file is easier to navigate than three.

import { z } from 'zod';

import { optionalString, paginationQuerySchema, uuidSchema } from './common.schemas';

// =============================================================================
// User — OneSignal
// =============================================================================

export const updateOneSignalPlayerIdSchema = z.object({
  oneSignalPlayerId: z.string().trim().min(1, 'OneSignal player ID is required'),
});

export const onesignalStatusByUserIdParamsSchema = z.object({
  userId: uuidSchema,
});

// =============================================================================
// Teacher search (public)
// =============================================================================

export const teacherSearchByCoordinatesQuerySchema = paginationQuerySchema.extend({
  latitude: z.coerce.number().min(-90, 'خط العرض غير صحيح').max(90, 'خط العرض غير صحيح'),
  longitude: z.coerce.number().min(-180, 'خط الطول غير صحيح').max(180, 'خط الطول غير صحيح'),
  maxDistance: z.coerce.number().min(0.1, 'المسافة القصوى غير صحيحة').max(50, 'المسافة القصوى غير صحيحة').optional(),
});

export const teacherSearchByLocationQuerySchema = paginationQuerySchema
  .extend({
    governorate: optionalString,
    city: optionalString,
    district: optionalString,
  })
  .refine((v) => v.governorate || v.city || v.district, {
    message: 'الموقع مطلوب (governorate أو city أو district)',
    path: ['governorate'],
  });

export const governorateParamSchema = z.object({
  governorate: z.string().trim().min(1, 'المحافظة مطلوبة'),
});

// =============================================================================
// Payments — Wayl webhook
// =============================================================================
//
// Loose body schema: Wayl owns the payload contract and ships fields outside
// our control. The controller already enforces HMAC over the raw bytes, so
// we don't want a strict shape rejecting legitimate Wayl variants. Just
// require `referenceId` (we need it to look up the per-link secret); pass
// the rest through.

export const waylWebhookBodySchema = z
  .object({
    referenceId: z.string().min(1, 'referenceId is required'),
  })
  .passthrough();
