import { z } from 'zod';

import { emailSchema } from './auth.schemas';

export const accountDeletionRequestSchema = z.object({
  email: emailSchema,
  phone: z.string().trim().max(32).optional().nullable(),
  reason: z.string().trim().max(2000).optional().nullable(),
  confirm: z
    .union([z.literal(true), z.literal('true'), z.literal('on'), z.literal('1')])
    .optional(),
});

export type AccountDeletionRequestBody = z.infer<typeof accountDeletionRequestSchema>;
