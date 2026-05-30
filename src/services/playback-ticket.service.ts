// HMAC-signed playback ticket for the HLS manifest proxy.
//
// Why this exists: the Phase 7 video player loads `playlist.m3u8` directly
// via a plain `Uri.parse` — there's no convenient way to attach a Bearer
// token to every HLS segment request the player will fire. We solve this
// by minting a short-lived, stateless ticket that the player puts on the
// initial manifest URL; the proxy controller validates the ticket before
// rewriting and forwarding the Bunny response.
//
// The ticket is HMAC-SHA256 over a `.`-delimited payload that the player
// just echoes back in the URL — no DB lookup is required to validate it.
//
// Format on the wire (single string, URL-safe):
//   v1.<courseId>.<lessonId>.<bunnyVideoId>.<expiresUnix>.<sigBase64Url>
//
// All UUIDs use dashes (no dots) and `bunnyVideoId` is a Bunny GUID
// (also dash-delimited UUID shape), so `.` is a safe field separator.
//
// Security envelope:
//   - Stateless: no DB hit on each segment fetch (4h TTL × 50 segments
//     would amplify the access-check load significantly).
//   - Bound to the specific (course, lesson, bunnyVideoId) triple — a
//     leaked ticket cannot be reused for a different lesson.
//   - Short-lived (default 4h, env-overridable) — matches the existing
//     Bunny token TTL so the player's manifest + Bunny URLs expire
//     together.
//   - Replay-tolerant: the ticket itself is the authorization. We accept
//     this — at 4h TTL a leaked ticket gives access to ONE lesson only;
//     real damage requires a leaked ticket + a way to reach the proxy.
//
// Env:
//   PLAYBACK_TICKET_SECRET — required; HMAC key. Pick a 256-bit random
//   value. Rotating the key invalidates every outstanding ticket — that
//   is intentional (an operator who suspects compromise can force-rotate
//   and immediately revoke all live tickets without DB writes).

import crypto from 'crypto';

const TICKET_VERSION = 'v1';

export interface PlaybackTicketPayload {
  courseId: string;
  lessonId: string;
  bunnyVideoId: string;
  expiresAt: Date;
}

export class PlaybackTicketService {
  /**
   * Read the HMAC secret. Throws (via the global error middleware) when
   * unset rather than silently signing tickets with an empty key — the
   * failure mode of an empty key is "every ticket validates" which is
   * the worst kind of silent compromise.
   */
  private static secret(): Buffer {
    const raw = (process.env['PLAYBACK_TICKET_SECRET'] ?? '').trim();
    if (raw.length < 16) {
      throw new Error(
        'PLAYBACK_TICKET_SECRET is not configured (must be >= 16 chars). ' +
        'Set a 256-bit random value before enabling the video proxy.',
      );
    }
    return Buffer.from(raw);
  }

  /** Build the canonical payload string (the part the HMAC signs). */
  private static buildPayload(args: {
    courseId: string;
    lessonId: string;
    bunnyVideoId: string;
    expiresUnix: number;
  }): string {
    return [
      TICKET_VERSION,
      args.courseId,
      args.lessonId,
      args.bunnyVideoId,
      String(args.expiresUnix),
    ].join('.');
  }

  /** URL-safe base64 without padding (Bunny + ticket use the same shape). */
  private static b64url(buf: Buffer): string {
    return buf
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private static fromB64url(s: string): Buffer {
    const padded = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    return Buffer.from(padded + pad, 'base64');
  }

  /**
   * Mint a ticket. Call once at `/playback-url` time, after access has
   * been verified. The returned `ticket` goes into the proxy URL.
   */
  static issue(args: {
    courseId: string;
    lessonId: string;
    bunnyVideoId: string;
    ttlSeconds: number;
  }): { ticket: string; expiresAt: Date } {
    const expiresUnix = Math.floor(Date.now() / 1000) + args.ttlSeconds;
    const payload = this.buildPayload({
      courseId: args.courseId,
      lessonId: args.lessonId,
      bunnyVideoId: args.bunnyVideoId,
      expiresUnix,
    });
    const sig = crypto.createHmac('sha256', this.secret()).update(payload).digest();
    return {
      ticket: `${payload}.${this.b64url(sig)}`,
      expiresAt: new Date(expiresUnix * 1000),
    };
  }

  /**
   * Verify a ticket and confirm it matches the (courseId, lessonId) that
   * the proxy route was reached with. Returns the decoded payload on
   * success or `null` on any failure (expired / malformed / mismatched /
   * bad signature). Constant-time signature compare.
   */
  static verify(
    ticket: string,
    expectedCourseId: string,
    expectedLessonId: string,
  ): PlaybackTicketPayload | null {
    if (!ticket || typeof ticket !== 'string') return null;

    // Expected format: v1.<courseId>.<lessonId>.<bunnyVideoId>.<expires>.<sig>
    const parts = ticket.split('.');
    if (parts.length !== 6) return null;
    const [version, courseId, lessonId, bunnyVideoId, expiresStr, sigB64] = parts as [
      string, string, string, string, string, string,
    ];
    if (version !== TICKET_VERSION) return null;
    if (courseId !== expectedCourseId) return null;
    if (lessonId !== expectedLessonId) return null;

    const expiresUnix = Number(expiresStr);
    if (!Number.isFinite(expiresUnix) || expiresUnix <= 0) return null;
    if (expiresUnix * 1000 < Date.now()) return null;

    const payload = this.buildPayload({
      courseId,
      lessonId,
      bunnyVideoId,
      expiresUnix,
    });
    let expectedSig: Buffer;
    let providedSig: Buffer;
    try {
      expectedSig = crypto.createHmac('sha256', this.secret()).update(payload).digest();
      providedSig = this.fromB64url(sigB64);
    } catch {
      return null;
    }
    if (providedSig.length !== expectedSig.length) return null;
    try {
      if (!crypto.timingSafeEqual(providedSig, expectedSig)) return null;
    } catch {
      return null;
    }

    return {
      courseId,
      lessonId,
      bunnyVideoId,
      expiresAt: new Date(expiresUnix * 1000),
    };
  }
}
