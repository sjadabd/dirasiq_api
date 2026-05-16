import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';

/**
 * Gates the super-admin registration endpoint.
 *
 * The first super admin has to be created somehow. Until this middleware
 * existed, `POST /api/auth/register/super-admin` was public — anyone with
 * knowledge of the endpoint could race to create the first super admin on
 * a fresh database. The endpoint did check `superAdminExists()` and reject
 * if one was already present, but that check is concurrency-vulnerable
 * (two simultaneous requests could both observe "no super admin yet" and
 * both succeed).
 *
 * Behaviour:
 *   - **`BOOTSTRAP_TOKEN` env unset or empty:** the endpoint behaves as if
 *     it doesn't exist (returns 404). This is the expected steady-state
 *     once the first super admin is in the database — the operator
 *     removes or blanks the env var and restarts.
 *   - **`BOOTSTRAP_TOKEN` set:** the request must carry
 *     `Authorization: Bearer <token>` matching the env value byte-for-byte.
 *     Comparison is constant-time (`crypto.timingSafeEqual`) so attackers
 *     can't infer the token via response-time differences.
 *
 * Future super admins (if ever needed) should be created out-of-band by an
 * existing super admin, not by re-enabling this gate. Keeping the gate
 * "off by default, on only during bootstrap" is the simplest stance.
 */
export function requireBootstrapToken(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const configured = process.env['BOOTSTRAP_TOKEN'];

  // Steady-state: env unset → endpoint is disabled.
  if (!configured || configured.trim() === '') {
    res.status(404).json({ success: false, message: 'Not found' });
    return;
  }

  // Reject anything that isn't an Authorization: Bearer <token> header.
  const header = String(req.headers['authorization'] || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res
      .status(401)
      .json({ success: false, message: 'Bootstrap token required' });
    return;
  }
  const supplied = match[1] || '';

  // Constant-time compare. timingSafeEqual requires equal lengths, so length
  // check is part of the safety check (we still want a uniform code path so
  // an attacker can't measure path length).
  const a = Buffer.from(configured, 'utf8');
  const b = Buffer.from(supplied, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res
      .status(401)
      .json({ success: false, message: 'Invalid bootstrap token' });
    return;
  }

  next();
}
