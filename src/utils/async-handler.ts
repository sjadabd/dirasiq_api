// asyncHandler — wraps an async (req,res,next) handler so any thrown error
// (including ApiError) flows into `next(err)` and reaches the global error
// middleware. Without this wrapper, an unhandled rejection inside an async
// controller would crash the Express request lifecycle.

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export type AsyncRequestHandler<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>,
> = (
  req: Request<P, ResBody, ReqBody, ReqQuery>,
  res: Response<ResBody>,
  next: NextFunction
) => Promise<unknown>;

export const asyncHandler =
  <P = Record<string, string>, ResBody = unknown, ReqBody = unknown, ReqQuery = Record<string, unknown>>(
    fn: AsyncRequestHandler<P, ResBody, ReqBody, ReqQuery>
  ): RequestHandler<P, ResBody, ReqBody, ReqQuery> =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
