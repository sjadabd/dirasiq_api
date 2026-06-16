import { z } from 'zod';

import { paginationQuerySchema } from './common.schemas';

export const accountDeletionListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['pending', 'completed', 'cancelled']).optional(),
});

export type AccountDeletionListQuery = z.infer<typeof accountDeletionListQuerySchema>;
