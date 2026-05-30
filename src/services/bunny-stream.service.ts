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
  /**
   * Sign EVERY Bunny asset URL on the way out? Off by default.
   * Turn this on ONLY when:
   *   1. The Bunny library has "Player → Token Authentication" enabled, AND
   *   2. "Block Direct URL Access" is OFF (so direct .b-cdn.net works).
   * Otherwise: leave off so raw URLs go to clients unchanged.
   *
   * Env flag: BUNNY_STREAM_SIGN_ASSETS=true|false  (default: false).
   */
  signAssets: boolean;
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

    // Defensive shape check — Bunny CDN hostnames are always the form
    // "vz-<account-uuid>.b-cdn.net". A value missing the suffix silently
    // produces broken thumbnail / playback URLs that ONLY surface as CSP
    // errors on the client. Loudly log so operators can self-diagnose
    // from container logs without combing through env files.
    if (!/\.b-cdn\.net$/i.test(cdnHostname) && !/\.mediadelivery\.net$/i.test(cdnHostname)) {
      logger.warn(
        { cdnHostname },
        'BunnyStreamService: BUNNY_STREAM_CDN_HOSTNAME looks malformed ' +
        '(expected something like "vz-xxxxxxxx.b-cdn.net"). All Bunny ' +
        'asset URLs will use this hostname verbatim — fix the env + ' +
        'restart the container.'
      );
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
      signAssets: process.env['BUNNY_STREAM_SIGN_ASSETS'] === 'true',
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
   * Build a signed HLS playback URL — convenience wrapper around the
   * generic signer (`signAssetPath`).
   *
   * Returns null if Bunny isn't configured — caller must handle.
   */
  static buildSignedPlaybackUrl(args: {
    videoId: string;
    clientIp?: string;
  }): { url: string; expiresAt: Date } | null {
    const cfg = this.config();
    if (!cfg) return null;

    const path = `/${args.videoId}/playlist.m3u8`;
    // HLS master references child variant manifests (360p/, 480p/, …) via
    // relative paths. Sign the video DIRECTORY so the same token authenticates
    // every child request — per-file signing 403s every child.
    const signingPathPrefix = `/${args.videoId}/`;
    const ttl = cfg.playbackTokenTtlSeconds;
    const signedRaw = signAssetPath({
      path,
      signingPathPrefix,
      ttlSeconds: ttl,
      cfg,
      ...(args.clientIp && cfg.ipLockPlayback ? { clientIp: args.clientIp } : {}),
    });
    // Append the optional ip query param for parity with the previous
    // contract — Bunny accepts it but doesn't require it.
    const ipSuffix = (cfg.ipLockPlayback && args.clientIp)
      ? `&ip=${encodeURIComponent(args.clientIp)}`
      : '';
    const url = `${signedRaw.url}${ipSuffix}`;

    return { url, expiresAt: signedRaw.expiresAt };
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
   * Composite webhook authentication. Bunny Stream's UI does NOT expose a
   * signing-secret field today, so we layer the cheaper checks BunnyDOES
   * give us — a per-link URL token we control + the account-specific
   * VideoLibraryId echoed in every body. HMAC stays as the strictest
   * mode for the day Bunny ships signed webhooks.
   *
   * Decision tree (top to bottom; first match wins):
   *
   *   1. Signature header present AND BUNNY_STREAM_WEBHOOK_SECRET set
   *      → strict HMAC compare. Reject on mismatch.
   *
   *   2. Otherwise:
   *      a. `?token=<value>` in the query string MUST equal
   *         BUNNY_WEBHOOK_TOKEN (constant-time compare; value never
   *         appears in logs).
   *      b. `VideoLibraryId` in the body MUST equal
   *         BUNNY_STREAM_LIBRARY_ID.
   *      c. (Optional) source IP MUST be in BUNNY_WEBHOOK_ALLOWED_IPS
   *         when that env is set.
   *
   *   3. Production safety net: if NODE_ENV=production AND no
   *      BUNNY_WEBHOOK_TOKEN is configured, refuse every unsigned
   *      webhook. We never want a misconfigured prod to silently fall
   *      back to "library id only" — that's a downgrade.
   *
   * Returns `{ ok, reason, mode }`. `reason` is a stable machine code
   * the controller logs verbatim; clients only see HTTP 401 + a generic
   * message so we don't leak which check failed.
   */
  static verifyWebhookAuth(args: {
    rawBody: string | Buffer;
    signatureHeader: string | undefined;
    libraryIdInBody: number | undefined;
    tokenInQuery: string | undefined;
    sourceIp: string | undefined;
  }): {
    ok: boolean;
    reason: string;
    mode: 'hmac' | 'token+library_id' | 'rejected';
  } {
    const cfg = this.config();
    if (!cfg) {
      return { ok: false, reason: 'bunny_not_configured', mode: 'rejected' };
    }

    // ---- Mode 1: HMAC if both ends agree ----------------------------------
    if (args.signatureHeader && cfg.webhookSecret) {
      const sigOk = this.verifyWebhookSignature({
        rawBody: args.rawBody,
        signatureHeader: args.signatureHeader,
      });
      if (sigOk) return { ok: true, reason: 'hmac_ok', mode: 'hmac' };
      return { ok: false, reason: 'hmac_mismatch', mode: 'rejected' };
    }

    // ---- Mode 2: token + libraryId ----------------------------------------
    const expectedToken = (process.env['BUNNY_WEBHOOK_TOKEN'] || '').trim();
    const isProduction = process.env['NODE_ENV'] === 'production';

    if (!expectedToken) {
      if (isProduction) {
        // Refuse to fall back to a weaker scheme in prod. Setting the
        // env is mandatory to accept unsigned webhooks here.
        return {
          ok: false,
          reason: 'bunny_webhook_token_unset_in_production',
          mode: 'rejected',
        };
      }
      // Dev / staging without a token: skip the token check so local
      // smoke tests still work (operators can curl the endpoint with
      // just the libraryId).
    } else {
      if (!args.tokenInQuery) {
        return { ok: false, reason: 'token_missing', mode: 'rejected' };
      }
      // Constant-time compare via crypto.timingSafeEqual. Lengths must
      // match first — timingSafeEqual throws on differing lengths and
      // the length itself is non-secret (long URLs are public).
      const provided = Buffer.from(args.tokenInQuery);
      const expected = Buffer.from(expectedToken);
      if (
        provided.length !== expected.length ||
        !crypto.timingSafeEqual(provided, expected)
      ) {
        return { ok: false, reason: 'token_mismatch', mode: 'rejected' };
      }
    }

    if (args.libraryIdInBody == null) {
      return { ok: false, reason: 'library_id_missing_in_body', mode: 'rejected' };
    }
    if (Number(args.libraryIdInBody) !== Number(cfg.libraryId)) {
      return { ok: false, reason: 'library_id_mismatch', mode: 'rejected' };
    }

    // ---- Optional Mode 3: IP allowlist ------------------------------------
    const allowedIpsRaw = (process.env['BUNNY_WEBHOOK_ALLOWED_IPS'] || '').trim();
    if (allowedIpsRaw) {
      const allowed = allowedIpsRaw.split(',').map((s) => s.trim()).filter(Boolean);
      const ip = args.sourceIp ?? '';
      if (!allowed.includes(ip)) {
        return { ok: false, reason: 'ip_not_allowlisted', mode: 'rejected' };
      }
    }

    return { ok: true, reason: 'token+library_id_ok', mode: 'token+library_id' };
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
 * Sign an asset path under the configured Bunny CDN hostname.
 *
 * Bunny Stream signing algorithm (per their official docs):
 *   hashable_base = security_key + signed_path + expires_unix [+ client_ip]
 *   raw_digest    = sha256(hashable_base)        ← RAW BINARY, NOT HEX
 *   token         = base64url(raw_digest)        ← URL-safe, no '=' padding
 *   url           = https://<host><asset_path>?token=<>&expires=<unix>
 *
 * Two signing modes are supported:
 *
 *   1. Per-file (default) — `signed_path` is the full asset path. The
 *      resulting token authenticates EXACTLY this URL. Suitable for static
 *      single-file assets (thumbnail.jpg, a downloadable mp4, etc.).
 *
 *   2. Path-prefix — pass `signingPathPrefix` (e.g. `/<videoGuid>/`).
 *      `signed_path` becomes that prefix, and an additional `token_path`
 *      query param is appended carrying base64url(prefix). Bunny then
 *      authenticates ANY request whose path starts with the prefix.
 *      Required for HLS playback: the master `playlist.m3u8` references
 *      child variant manifests (`360p/video.m3u8`, …) via relative paths;
 *      per-file signing 403s every child request because each variant
 *      manifest needs its own signed URL otherwise.
 *
 * NOTE: this is plain SHA-256 over a concatenated string — NOT HMAC-SHA256.
 * A previous implementation mistakenly used HMAC; that produced superficially-
 * valid tokens that Bunny rejected with HTTP 403. If you change this signing
 * code, test against the Bunny Stream "Token Authentication test" tool in
 * their dashboard before shipping.
 *
 * If `cfg.ipLockPlayback` is on AND a `clientIp` is provided, the IP is
 * appended to the hashable base (Bunny's optional IP-binding feature).
 */
export function signAssetPath(args: {
  path: string;
  ttlSeconds: number;
  cfg: BunnyStreamConfig;
  clientIp?: string;
  /**
   * Optional directory prefix to sign instead of the exact `path`. When
   * provided, the resulting URL keeps `path` as the asset location but the
   * token is computed over the prefix, and `token_path=<base64url(prefix)>`
   * is appended so Bunny accepts any child URL under the prefix.
   */
  signingPathPrefix?: string;
}): { url: string; expiresAt: Date } {
  const path = args.path.startsWith('/') ? args.path : `/${args.path}`;
  const expiresUnix = Math.floor(Date.now() / 1000) + args.ttlSeconds;
  const ipPart = (args.cfg.ipLockPlayback && args.clientIp) ? args.clientIp : '';
  const signedPath = args.signingPathPrefix ?? path;
  const hashable = `${args.cfg.tokenKey}${signedPath}${expiresUnix}${ipPart}`;
  const token = crypto
    .createHash('sha256')
    .update(hashable)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  let url = `https://${args.cfg.cdnHostname}${path}?token=${token}&expires=${expiresUnix}`;
  if (args.signingPathPrefix) {
    const tokenPath = Buffer.from(args.signingPathPrefix)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    url += `&token_path=${tokenPath}`;
  }
  return { url, expiresAt: new Date(expiresUnix * 1000) };
}

/**
 * Extract the Bunny video directory prefix (`/<videoGuid>/`) from a full
 * asset path, or return null if the path doesn't look like a Bunny video
 * asset. The first segment of a Bunny Stream URL is always the video guid.
 */
function videoDirectoryPrefix(path: string): string | null {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  // Defence in depth: Bunny video guids are UUIDs; if the first segment
  // doesn't even loosely look like one, fall back to per-file signing.
  if (!/^[a-f0-9-]{8,}$/i.test(segments[0]!)) return null;
  return `/${segments[0]}/`;
}

/**
 * Sign an arbitrary stored Bunny asset URL — used by the lesson hydration
 * path to upgrade unsigned URLs (thumbnails, playback) to signed ones at
 * read time. Returns null when:
 *   - Input URL is empty / unparseable.
 *   - Bunny isn't configured.
 *   - URL hostname doesn't belong to our CDN (defence-in-depth — we won't
 *     sign URLs to random hosts even if a row was tampered).
 *
 * The URL hostname is hydrated to the current CDN hostname before signing,
 * so stale rows with the old (mis-typed) hostname self-heal.
 */
export function signBunnyAssetUrl(
  rawUrl: string | null | undefined,
  cfg: BunnyStreamConfig | null = BunnyStreamService.config(),
  ttlSecondsOverride?: number,
): string | null {
  if (!rawUrl) return null;
  if (!cfg) return rawUrl;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  // Hydrate hostname FIRST so stale rows self-heal even when signing.
  const effectiveHost = cfg.cdnHostname;
  // Skip signing if the path looks foreign (e.g. somebody put a non-Bunny
  // URL in the column — leave it alone instead of returning a fake-signed
  // URL that won't work).
  if (
    !parsed.hostname.endsWith('.b-cdn.net') &&
    !parsed.hostname.endsWith('.mediadelivery.net') &&
    parsed.hostname !== effectiveHost
  ) {
    return rawUrl;
  }
  const ttl = ttlSecondsOverride ?? cfg.playbackTokenTtlSeconds;
  // Sign the video directory (`/<videoGuid>/`) rather than the exact file.
  // The same token then authenticates every asset under the directory —
  // thumbnail, master playlist, AND every child variant playlist + segment.
  // Per-file signing was the root cause of the HLS playback 403 storm
  // diagnosed during the Phase 7 QA pass.
  const signingPathPrefix = videoDirectoryPrefix(parsed.pathname);
  const signed = signAssetPath({
    path: parsed.pathname,
    ttlSeconds: ttl,
    cfg,
    ...(signingPathPrefix ? { signingPathPrefix } : {}),
  });
  return signed.url;
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
