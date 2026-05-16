// Pagination helpers. One place to parse `?page=&limit=` and one place to
// build the `meta.pagination` block on list responses.
//
// Defaults: page=1, limit=20. Caps at limit<=100 to bound memory and the
// shape of a single response. Models accept `{ offset, limit }` from this
// helper; controllers pass the resulting meta block into `paginated()`.

import { z } from 'zod';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const parsePagination = (
  raw: Record<string, unknown> | undefined
): PaginationParams => {
  const page = Math.max(1, Number(raw?.['page']) || 1);
  const requestedLimit = Number(raw?.['limit']) || DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

export const buildPaginationMeta = (
  total: number,
  page: number,
  limit: number
): PaginationMeta => ({
  page,
  limit,
  total,
  totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
});
