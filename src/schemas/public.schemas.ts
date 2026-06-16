import { z } from 'zod';

import { emailSchema } from './auth.schemas';

const optionalTrimmedField = z.preprocess(
  (value) => {
    if (value == null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  },
  z.string().max(2000).nullable().optional(),
);

export const accountDeletionRequestSchema = z.object({
  email: emailSchema,
  phone: z.preprocess(
    (value) => {
      if (value == null) return null;
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    },
    z.string().max(32).nullable().optional(),
  ),
  reason: optionalTrimmedField,
  confirm: z.union([
    z.literal(true),
    z.literal('true'),
    z.literal('on'),
    z.literal('1'),
  ], { message: 'Please confirm account deletion' }),
  source: z.literal('delete-account-page').optional(),
});

export type AccountDeletionRequestBody = z.infer<typeof accountDeletionRequestSchema>;
