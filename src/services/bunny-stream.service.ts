// Bunny Stream — Phase 7 foundations + Phase 10.1.A video-courses extensions.
//
// Phase 7 shipped the env-var sanity layer + signed-HLS-URL signer (still
// intact below). Phase 10.1.A adds the REST surface the video-courses
// flow needs: createVideo / getVideo / deleteVideo + webhook signature
// verification + Bunny-status mapping.
//
// Required env (production):
//   BUNNY_STREAM_LIBRARY_ID       — numeric library id
//   BUNNY_STREAM_API_KEY          — admin api key, used for upload + management
//   BUNNY_STREAM_CDN_HOSTNAME     — e.g. "vz-12345.b-cdn.net" — the CDN host
//   BUNNY_STREAM_TOKEN_KEY        — token authentication key (Bunny panel)
//   BUNNY_STREAM_WEBHOOK_SECRET   — Phase 10.1 — shared HMAC secret for webhook
//                                   bodies. If unset, the webhook endpoint
//                                   rejects every call as 401 (failing safe).
//
// Optional env:
//   BUNNY_PLAYBACK_TOKEN_TTL_SECONDS  — default 14400 (4h)
//   BUNNY_PLAYBACK_TOKEN_IP_LOCK      — "true" / "false" — bind token to IP
//   BUNNY_STREAM_API_BASE             — defaults to https://video.bunnycdn.com
//
// All Bunny REST calls fail fast (10s timeout) and surface as ApiError
// instances so the global error middleware can produce canonical envelopes.

import crypto from 'crypto';

import { ApiError, ErrorCodes } from '../utils/api-error';
import { VideoLessonBunnyStatus } from '../types';
import { logger } from '../utils/logger';

export interface BunnyStreamConfig {
  libraryId: string;
  apiKey: string;
  cdnHostname: string;
  tokenKey: string;
  webhookSecret: string | null; // null = webhook signature verification disabled
  playbackTokenTtlSeconds: number;
  ipLockPlayback: boolean;
  apiBaseUrl: string;
}

/** Bunny REST base. Public default. Override via env in tests / non-prod. */
const DEFAULT_BUNNY_API_BASE = 'https://video.bunnycdn.com';

let cached: BunnyStreamConfig | null = null;

export class BunnyStreamService {
  /**
   * Loads + validates the config once. Returns null if any required env var
   * is missing — callers should treat that as "video features disabled" and
   * surface a clear admin-facing error, not crash the app.
   */
  static config(): BunnyStreamConfig | null {
    if (cached) return cached;

    const libraryId = process.env['BUNNY_STREAM_LIBRARY_ID'];
    const apiKey = process.env['BUNNY_STREAM_API_KEY'];
    const cdnHostname = process.env['BUNNY_STREAM_CDN_HOSTNAME'];
    const tokenKey = process.env['BUNNY_STREAM_TOKEN_KEY'];

    if (!libraryId || !apiKey || !cdnHostname || !tokenKey) {
      logger.warn(
        {
          hasLibraryId: Boolean(libraryId),
          hasApiKey: Boolean(apiKey),
          hasCdnHostname: Boolean(cdnHostname),
          hasTokenKey: Boolean(tokenKey),
        },
        'BunnyStreamService: env not fully configured — video features disabled',
      );
      return null;
    }

    cached = {
      libraryId,
      apiKey,
      cdnHostname,
      tokenKey,
      webhookSecret: process.env['BUNNY_STREAM_WEBHOOK_SECRET'] || null,
      playbackTokenTtlSeconds: Number(process.env['BUNNY_PLAYBACK_TOKEN_TTL_SECONDS'] || 14400),
      ipLockPlayback: process.env['BUNNY_PLAYBACK_TOKEN_IP_LOCK'] === 'true',
      apiBaseUrl: process.env['BUNNY_STREAM_API_BASE'] || DEFAULT_BUNNY_API_BASE,
    };
    return cached;
  }

  /**
   * Force-reset the cached config. Test-only — production callers should
   * never need this, but jest tests that mutate process.env must clear the
   * cache to pick up new values.
   */
  static resetCacheForTests(): void {
    cached = null;
  }

  /** Cheap check used by routes that must short-circuit early. */
  static isConfigured(): boolean {
    return this.config() !== null;
  }

  /**
   * Build a signed HLS playback URL. The token authenticates the request
   * to Bunny's edge AND optionally locks it to a single IP for the
   * token's lifetime. The URL we return is what the player consumes.
   *
   * Signature algorithm (Bunny Stream Token Auth):
   *   token = HMAC_SHA256_hex(tokenKey, "videoId" + expiresUnix + optionalIp)
   *
   * We URL-base64 the token (RFC 4648 with - / _ and no =) per Bunny's spec.
   *
   * Returns null if Bunny isn't configured — caller must handle.
   */
  static buildSignedPlaybackUrl(args: {
    videoId: string;
    clientIp?: string;
  }): { url: string; expiresAt: Date } | null {
    const cfg = this.config();
    if (!cfg) return null;

    const expiresUnix = Math.floor(Date.now() / 1000) + cfg.playbackTokenTtlSeconds;
    const ipSegment = cfg.ipLockPlayback && args.clientIp ? args.clientIp : '';
    const message = `${args.videoId}${expiresUnix}${ipSegment}`;
    const hmac = crypto
      .createHmac('sha256', cfg.tokenKey)
      .update(message)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

    const url = `https://${cfg.cdnHostname}/${args.videoId}/playlist.m3u8?token=${hmac}&expires=${expiresUnix}${
      cfg.ipLockPlayback && args.clientIp ? `&ip=${encodeURIComponent(args.clientIp)}` : ''
    }`;

    return { url, expiresAt: new Date(expiresUnix * 1000) };
  }

  // ----------------------------------------------------------------------
  // Phase 10.1.A — Bunny REST surface for the video-courses domain.
  // ----------------------------------------------------------------------

  /**
   * Create a placeholder video on Bunny and return its `guid`. The caller
   * follows up with a PUT to the upload URL (Phase 10.1.B) to ship the
   * actual bytes. Bunny's POST /library/{libraryId}/videos returns
   * `{ guid, ... }`.
   */
  static async createVideo(args: { title: string }): Promise<{ videoId: string }> {
    const cfg = this.requireConfig('createVideo');
    const url = `${cfg.apiBaseUrl}/library/${cfg.libraryId}/videos`;
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        AccessKey: cfg.apiKey,
      },
      body: JSON.stringify({ title: args.title }),
    });
    if (!res.ok) {
      const body = await safeReadText(res);
      logger.warn({ status: res.status, body }, 'bunny.createVideo failed');
      throw new ApiError(
        502,
        'تعذر إنشاء الفيديو على Bunny Stream',
        ErrorCodes.SERVICE_UNAVAILABLE
      );
    }
    const data = (await res.json()) as { guid?: string };
    if (!data.guid) {
      throw new ApiError(
        502,
        'استجابة Bunny غير صالحة (لا يوجد guid)',
        ErrorCodes.SERVICE_UNAVAILABLE
      );
    }
    return { videoId: data.guid };
  }

  /**
   * Fetch the current Bunny state for a video. Used by the reconcile
   * endpoint when a webhook is missed.
   */
  static async getVideo(videoId: string): Promise<BunnyVideoDetails> {
    const cfg = this.requireConfig('getVideo');
    const url = `${cfg.apiBaseUrl}/library/${cfg.libraryId}/videos/${videoId}`;
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { AccessKey: cfg.apiKey, Accept: 'application/json' },
    });
    if (!res.ok) {
      const body = await safeReadText(res);
      logger.warn(
        { status: res.status, body, videoId },
        'bunny.getVideo failed'
      );
      throw new ApiError(
        502,
        'تعذر الاتصال بـ Bunny Stream',
        ErrorCodes.SERVICE_UNAVAILABLE
      );
    }
    const data = (await res.json()) as {
      guid?: string;
      status?: number;
      thumbnailFileName?: string;
      length?: number;
    };
    if (!data.guid) {
      throw new ApiError(
        502,
        'استجابة Bunny غير صالحة',
        ErrorCodes.SERVICE_UNAVAILABLE
      );
    }
    const internalStatus = mapBunnyStatusToInternal(data.status ?? 0);
    const thumbnailUrl = data.thumbnailFileName
      ? `https://${cfg.cdnHostname}/${data.guid}/${data.thumbnailFileName}`
      : `https://${cfg.cdnHostname}/${data.guid}/thumbnail.jpg`;
    const playbackUrl = `https://${cfg.cdnHostname}/${data.guid}/playlist.m3u8`;
    return {
      videoId: data.guid,
      status: internalStatus,
      thumbnailUrl,
      playbackUrl,
      durationSeconds: data.length ?? 0,
    };
  }

  /**
   * Delete a Bunny video. Used when an admin deletes a lesson or when a
   * teacher abandons a not-yet-uploaded lesson. Bunny returns 200 on
   * success, 404 if already gone (treated as success).
   */
  static async deleteVideo(videoId: string): Promise<void> {
    const cfg = this.requireConfig('deleteVideo');
    const url = `${cfg.apiBaseUrl}/library/${cfg.libraryId}/videos/${videoId}`;
    const res = await fetchWithTimeout(url, {
      method: 'DELETE',
      headers: { AccessKey: cfg.apiKey },
    });
    if (!res.ok && res.status !== 404) {
      const body = await safeReadText(res);
      logger.warn(
        { status: res.status, body, videoId },
        'bunny.deleteVideo failed'
      );
      throw new ApiError(
        502,
        'تعذر حذف الفيديو من Bunny Stream',
        ErrorCodes.SERVICE_UNAVAILABLE
      );
    }
  }

  /**
   * Verify a Bunny webhook signature header.
   *
   * Bunny signs the raw request body with `BUNNY_STREAM_WEBHOOK_SECRET`
   * using HMAC-SHA256 and ships the hex digest in the
   * `Bunny-Webhook-Signature` header. We accept either `sha256=<hex>` or
   * bare `<hex>` because Bunny has shipped both formats over time. Match
   * is constant-time via `crypto.timingSafeEqual`.
   *
   * Returns false if the webhook secret env var is unset — this fails
   * SAFELY (every webhook is rejected) rather than fail open.
   */
  static verifyWebhookSignature(args: {
    rawBody: string | Buffer;
    signatureHeader: string | undefined;
  }): boolean {
    const cfg = this.config();
    if (!cfg || !cfg.webhookSecret) return false;
    if (!args.signatureHeader) return false;

    const expected = crypto
      .createHmac('sha256', cfg.webhookSecret)
      .update(args.rawBody)
      .digest('hex');

    const provided = args.signatureHeader.replace(/^sha256=/i, '').trim();
    if (provided.length !== expected.length) return false;

    try {
      return crypto.timingSafeEqual(
        Buffer.from(provided, 'hex'),
        Buffer.from(expected, 'hex')
      );
    } catch {
      return false;
    }
  }

  /**
   * Internal — fetch the config or throw with a label that identifies
   * which method needed it (for debugging).
   */
  private static requireConfig(forMethod: string): BunnyStreamConfig {
    const cfg = this.config();
    if (!cfg) {
      throw new ApiError(
        503,
        `Bunny Stream is not configured (called from ${forMethod})`,
        ErrorCodes.SERVICE_UNAVAILABLE
      );
    }
    return cfg;
  }
}

// ---------------------------------------------------------------------------
// Phase 10.1.A — public helpers (used by tests + the webhook handler)
// ---------------------------------------------------------------------------

export interface BunnyVideoDetails {
  videoId: string;
  status: VideoLessonBunnyStatus;
  thumbnailUrl: string;
  /** Raw HLS manifest URL — never expose to clients without signing. */
  playbackUrl: string;
  durationSeconds: number;
}

/**
 * Re-stamp a stored Bunny URL with the CURRENTLY-configured CDN hostname.
 *
 * Why this exists: a Bunny URL is composed at webhook-receipt time from
 * `cdnHostname` + `videoGuid` + asset path. If `BUNNY_STREAM_CDN_HOSTNAME`
 * was set incorrectly (e.g. missing the `.b-cdn.net` suffix) when the
 * webhook fired, the persisted URL is permanently broken — even after
 * the operator corrects the env var.
 *
 * This helper rebuilds the URL on every read using the path from the
 * stored value (which Bunny owns + is correct) and the hostname from the
 * current config (which the operator owns + may have just fixed). The
 * result is a stable, environment-driven URL that self-heals when the
 * operator corrects mis-configurations.
 *
 * Pass-through behaviour:
 *   - null / empty             → null
 *   - unparseable strings       → returned as-is (defence in depth)
 *   - hostname already matches → returned unchanged
 *   - missing Bunny config      → returned as-is (no host to substitute)
 */
export function hydrateBunnyUrl(
  storedUrl: string | null | undefined,
  cfg: BunnyStreamConfig | null = BunnyStreamService.config()
): string | null {
  if (!storedUrl) return null;
  if (!cfg) return storedUrl;
  try {
    const u = new URL(storedUrl);
    if (u.hostname === cfg.cdnHostname) return storedUrl;
    return `https://${cfg.cdnHostname}${u.pathname}${u.search}`;
  } catch {
    return storedUrl;
  }
}

/**
 * Maps Bunny's numeric status codes to our internal enum.
 *
 * Bunny status reference (from their webhook docs):
 *   0 = Created            → PENDING
 *   1 = Uploaded           → UPLOADED
 *   2 = Processing         → PROCESSING
 *   3 = Transcoding        → PROCESSING
 *   4 = Finished           → READY
 *   5 = Error              → FAILED
 *   6 = UploadFailed       → FAILED
 *   7 = JitSegmenting      → PROCESSING
 *   8 = JitPlaylistsCreated → PROCESSING
 *
 * Unknown codes are mapped to PROCESSING — we'd rather wait for clarity
 * than spuriously mark a healthy video as FAILED.
 */
export function mapBunnyStatusToInternal(
  bunnyStatusCode: number
): VideoLessonBunnyStatus {
  switch (bunnyStatusCode) {
    case 0:
      return VideoLessonBunnyStatus.PENDING;
    case 1:
      return VideoLessonBunnyStatus.UPLOADED;
    case 2:
    case 3:
    case 7:
    case 8:
      return VideoLessonBunnyStatus.PROCESSING;
    case 4:
      return VideoLessonBunnyStatus.READY;
    case 5:
    case 6:
      return VideoLessonBunnyStatus.FAILED;
    default:
      return VideoLessonBunnyStatus.PROCESSING;
  }
}

// ---------------------------------------------------------------------------
// Internal HTTP helper — wraps fetch with a hard 10-second timeout so a
// hung Bunny endpoint never blocks the API event loop indefinitely.
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 10_000);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<unreadable>';
  }
}
