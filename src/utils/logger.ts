// Structured logger (pino). Replaces ad-hoc `console.log` / `console.error`
// calls across the API. Every log line in a request context carries the
// X-Request-ID so events can be correlated.
//
// Pattern:
//   import { logger } from '@/utils/logger';
//   logger.info({ userId }, 'user logged in');
//   req.log.info({ bookingId }, 'booking created');   // request-scoped
//
// `req.log` is wired by `pino-http` in `src/index.ts` and is a child logger
// already bound to the request id. Prefer it inside route handlers.

import pino, { type LoggerOptions } from 'pino';

const isProduction = process.env['NODE_ENV'] === 'production';
const isTest = process.env['NODE_ENV'] === 'test';

const baseOptions: LoggerOptions = {
  level: process.env['LOG_LEVEL'] || (isTest ? 'silent' : isProduction ? 'info' : 'debug'),
  base: { service: 'dirasiq-api' },
  // Redact obvious secrets if they ever appear in log objects.
  redact: {
    paths: [
      'password',
      'newPassword',
      'currentPassword',
      'token',
      'accessToken',
      'refreshToken',
      'authorization',
      'cookie',
      '*.password',
      '*.token',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
    ],
    remove: true,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

// Dev: pretty-print to stdout. Prod: JSON to stdout (one line per event).
const transport =
  !isProduction && !isTest
    ? pino.transport({
        target: 'pino/file',
        options: { destination: 1 }, // 1 = stdout
      })
    : undefined;

export const logger = transport
  ? pino(baseOptions, transport)
  : pino(baseOptions);
