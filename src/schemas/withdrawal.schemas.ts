// Super-admin withdrawal-review schemas.

import { z } from 'zod';

import { paginationQuerySchema } from './common.schemas';

export const withdrawalIdParamSchema = z.object({
  id: z.string().uuid('معرف الطلب غير صالح'),
});

export const withdrawalListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['pending', 'approved', 'rejected', 'paid']).optional(),
});

export const withdrawalApproveBodySchema = z.object({
  adminNotes: z.string().trim().max(500).optional(),
});

export const withdrawalRejectBodySchema = z.object({
  reason: z.string({ error: 'سبب الرفض مطلوب' }).trim().min(1, 'سبب الرفض مطلوب').max(500),
});

export const withdrawalMarkPaidBodySchema = z.object({
  method: z.enum(['bank_transfer', 'wayl_manual', 'cash', 'other'], {
    error: 'طريقة التحويل مطلوبة',
  }),
  reference: z.string().trim().max(255).optional(),
  destination: z.string().trim().max(500).optional(),
  // Base64 data URL of the transfer-receipt image. Required — the teacher must
  // see proof of the payout.
  receiptImage: z
    .string({ error: 'صورة وصل التحويل مطلوبة' })
    .regex(/^data:image\/[A-Za-z.+-]+;base64,/, 'صيغة صورة الوصل غير صالحة'),
});
