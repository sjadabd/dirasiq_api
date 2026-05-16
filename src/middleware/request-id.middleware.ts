// requestId middleware — assigns each request a stable id (from the inbound
// `X-Request-ID` header if present, otherwise a fresh UUIDv4) and echoes it
// back on the response. The pino-http middleware downstream picks up `req.id`
// automatically, so every log line in the request scope is correlated.

import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

const HEADER = 'X-Request-ID';

export const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const incoming = req.header(HEADER);
  const id =
    incoming && /^[A-Za-z0-9._:-]{4,128}$/.test(incoming)
      ? incoming
      : randomUUID();
  req.id = id;
  res.setHeader(HEADER, id);
  next();
};
